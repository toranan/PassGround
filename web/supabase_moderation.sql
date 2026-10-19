-- 커뮤니티 신고·차단·이용정지 (App Store 가이드라인 1.2 대응). 서버(service role)만 읽고 쓴다. 2026-10-19 운영 DB에 적용함.
alter table public.posts add column if not exists is_hidden boolean not null default false;
alter table public.comments add column if not exists is_hidden boolean not null default false;
alter table public.profiles add column if not exists banned_at timestamptz;
create table if not exists public.content_reports (id uuid primary key default gen_random_uuid(), target_type text not null check (target_type in ('post', 'comment')), target_id uuid not null, post_id uuid, reporter_id uuid not null, reported_user_id uuid, reason text not null default '기타', status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')), created_at timestamptz not null default now(), resolved_at timestamptz, unique (reporter_id, target_type, target_id));
create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);
create table if not exists public.user_blocks (blocker_id uuid not null, blocked_id uuid not null, created_at timestamptz not null default now(), primary key (blocker_id, blocked_id));
alter table public.content_reports enable row level security;
alter table public.user_blocks enable row level security;
