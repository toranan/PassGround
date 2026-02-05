create extension if not exists "pgcrypto";

-- helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- core: exams (categories) -> boards -> posts -> comments
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, slug)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  bio text,
  avatar_url text,
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.user_role as enum ('admin', 'moderator');

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role in ('admin', 'moderator')
  );
$$;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete cascade,
  author_name text not null,
  title text not null,
  content text not null,
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete cascade,
  author_name text not null,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.bookmarks (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  file_name text,
  file_size int,
  mime_type text,
  created_at timestamptz not null default now(),
  check (
    (post_id is not null and comment_id is null)
    or (post_id is null and comment_id is not null)
  )
);


-- indexes
create index if not exists boards_exam_id_idx on public.boards (exam_id);
create index if not exists posts_board_id_idx on public.posts (board_id);
create index if not exists posts_author_id_idx on public.posts (author_id);
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists comments_post_id_idx on public.comments (post_id);
create index if not exists comments_author_id_idx on public.comments (author_id);
create index if not exists comments_parent_id_idx on public.comments (parent_id);

-- updated_at triggers
create trigger exams_set_updated_at
before update on public.exams
for each row execute function public.set_updated_at();

create trigger boards_set_updated_at
before update on public.boards
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

-- RLS
alter table public.exams enable row level security;
alter table public.boards enable row level security;
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.comment_likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.tags enable row level security;
alter table public.post_tags enable row level security;
alter table public.attachments enable row level security;
alter table public.user_roles enable row level security;

-- exams/boards: public read, admin write
create policy "exams_read" on public.exams
for select using (true);

create policy "exams_write_admin" on public.exams
for all using (public.is_admin()) with check (public.is_admin());

create policy "boards_read" on public.boards
for select using (true);

create policy "boards_write_admin" on public.boards
for all using (public.is_admin()) with check (public.is_admin());

-- profiles: public read, owner write
create policy "profiles_read" on public.profiles
for select using (true);

create policy "profiles_insert_self" on public.profiles
for insert with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

-- posts: public read, author write, admin override
create policy "posts_read" on public.posts
for select using (true);

create policy "posts_insert_auth" on public.posts
for insert with check (true);

create policy "posts_update_owner" on public.posts
for update using (auth.uid() = author_id or public.is_admin())
with check (auth.uid() = author_id or public.is_admin());

create policy "posts_delete_owner" on public.posts
for delete using (auth.uid() = author_id or public.is_admin());

-- comments: public read, author write, admin override
create policy "comments_read" on public.comments
for select using (true);

create policy "comments_insert_auth" on public.comments
for insert with check (true);

create policy "comments_update_owner" on public.comments
for update using (auth.uid() = author_id or public.is_admin())
with check (auth.uid() = author_id or public.is_admin());

create policy "comments_delete_owner" on public.comments
for delete using (auth.uid() = author_id or public.is_admin());

-- likes/bookmarks: owner only
create policy "post_likes_read" on public.post_likes
for select using (auth.uid() = user_id);

create policy "post_likes_insert" on public.post_likes
for insert with check (auth.uid() = user_id);

create policy "post_likes_delete" on public.post_likes
for delete using (auth.uid() = user_id);

create policy "comment_likes_read" on public.comment_likes
for select using (auth.uid() = user_id);

create policy "comment_likes_insert" on public.comment_likes
for insert with check (auth.uid() = user_id);

create policy "comment_likes_delete" on public.comment_likes
for delete using (auth.uid() = user_id);

create policy "bookmarks_read" on public.bookmarks
for select using (auth.uid() = user_id);

create policy "bookmarks_insert" on public.bookmarks
for insert with check (auth.uid() = user_id);

create policy "bookmarks_delete" on public.bookmarks
for delete using (auth.uid() = user_id);

-- tags/post_tags: public read, admin write
create policy "tags_read" on public.tags
for select using (true);

create policy "tags_write_admin" on public.tags
for all using (public.is_admin()) with check (public.is_admin());

create policy "post_tags_read" on public.post_tags
for select using (true);

create policy "post_tags_write_admin" on public.post_tags
for all using (public.is_admin()) with check (public.is_admin());

-- attachments: public read, uploader write
create policy "attachments_read" on public.attachments
for select using (true);

create policy "attachments_insert" on public.attachments
for insert with check (auth.uid() = uploader_id);

create policy "attachments_delete" on public.attachments
for delete using (auth.uid() = uploader_id or public.is_admin());

-- user_roles: admin only
create policy "user_roles_read_admin" on public.user_roles
for select using (public.is_admin());

create policy "user_roles_write_admin" on public.user_roles
for all using (public.is_admin()) with check (public.is_admin());
