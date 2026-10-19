-- 커뮤니티 신고·차단·이용정지 (App Store 가이드라인 1.2 대응). 서버(service role)만 읽고 쓴다.

-- 신고 누적이나 관리자 조치로 숨긴 글·댓글
alter table public.posts add column if not exists is_hidden boolean not null default false;
alter table public.comments add column if not exists is_hidden boolean not null default false;

-- 이용 정지된 사용자는 글·댓글을 쓸 수 없다.
alter table public.profiles add column if not exists banned_at timestamptz;

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  post_id uuid,
  reporter_id uuid not null,
  reported_user_id uuid,
  reason text not null default '기타',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint content_reports_target_type_check check (target_type in ('post', 'comment')),
  constraint content_reports_status_check check (status in ('pending', 'resolved', 'dismissed')),
  constraint content_reports_unique_reporter unique (reporter_id, target_type, target_id)
);

create index if not exists content_reports_pending_idx on public.content_reports (created_at desc) where status = 'pending';
create index if not exists content_reports_target_idx on public.content_reports (target_type, target_id);

create table if not exists public.user_blocks (
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.content_reports enable row level security;
alter table public.user_blocks enable row level security;
