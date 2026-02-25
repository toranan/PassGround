-- Post stats aggregate table for fast community list/detail reads.
-- Safe to run multiple times.

create table if not exists public.post_stats (
  post_id uuid primary key references public.posts(id) on delete cascade,
  comment_count int not null default 0,
  like_count int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists post_stats_updated_at_idx on public.post_stats(updated_at desc);

create or replace function public.bump_post_stats(
  p_post_id uuid,
  p_comment_delta int default 0,
  p_like_delta int default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_post_id is null then
    return;
  end if;

  insert into public.post_stats(post_id, comment_count, like_count, updated_at)
  values (
    p_post_id,
    greatest(0, p_comment_delta),
    greatest(0, p_like_delta),
    now()
  )
  on conflict (post_id) do update
  set
    comment_count = greatest(0, public.post_stats.comment_count + p_comment_delta),
    like_count = greatest(0, public.post_stats.like_count + p_like_delta),
    updated_at = now();
end;
$$;

create or replace function public.ensure_post_stats_row()
returns trigger
language plpgsql
as $$
begin
  insert into public.post_stats(post_id, comment_count, like_count, updated_at)
  values (new.id, 0, 0, now())
  on conflict (post_id) do nothing;
  return new;
end;
$$;

create or replace function public.sync_post_stats_from_comments()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.bump_post_stats(new.post_id, 1, 0);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.bump_post_stats(old.post_id, -1, 0);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.post_id is distinct from old.post_id then
    perform public.bump_post_stats(old.post_id, -1, 0);
    perform public.bump_post_stats(new.post_id, 1, 0);
  end if;
  return new;
end;
$$;

create or replace function public.sync_post_stats_from_post_likes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.bump_post_stats(new.post_id, 0, 1);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.bump_post_stats(old.post_id, 0, -1);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists posts_ensure_post_stats on public.posts;
create trigger posts_ensure_post_stats
after insert on public.posts
for each row execute function public.ensure_post_stats_row();

drop trigger if exists comments_sync_post_stats on public.comments;
create trigger comments_sync_post_stats
after insert or delete or update of post_id on public.comments
for each row execute function public.sync_post_stats_from_comments();

drop trigger if exists post_likes_sync_post_stats on public.post_likes;
create trigger post_likes_sync_post_stats
after insert or delete on public.post_likes
for each row execute function public.sync_post_stats_from_post_likes();

-- Backfill and reconcile existing rows.
insert into public.post_stats(post_id, comment_count, like_count, updated_at)
select
  p.id as post_id,
  coalesce(c.comment_count, 0) as comment_count,
  coalesce(l.like_count, 0) as like_count,
  now() as updated_at
from public.posts p
left join (
  select post_id, count(*)::int as comment_count
  from public.comments
  group by post_id
) c on c.post_id = p.id
left join (
  select post_id, count(*)::int as like_count
  from public.post_likes
  group by post_id
) l on l.post_id = p.id
on conflict (post_id) do update
set
  comment_count = excluded.comment_count,
  like_count = excluded.like_count,
  updated_at = now();

alter table public.post_stats enable row level security;

drop policy if exists post_stats_read on public.post_stats;
create policy post_stats_read on public.post_stats
for select using (true);
