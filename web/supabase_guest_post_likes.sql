-- 로그인 없이 누른 게시글 좋아요. post_likes.user_id는 profiles를 참조해서 기기 ID를 넣을 수 없다.
-- service role(API 라우트)로만 접근하므로 RLS 정책은 두지 않는다.
-- supabase_post_stats.sql 적용 후 Supabase SQL Editor에서 1회 실행한다.
create table if not exists public.guest_post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  device_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, device_id)
);

alter table public.guest_post_likes enable row level security;

drop trigger if exists guest_post_likes_sync_post_stats on public.guest_post_likes;
create trigger guest_post_likes_sync_post_stats
after insert or delete on public.guest_post_likes
for each row execute function public.sync_post_stats_from_post_likes();
