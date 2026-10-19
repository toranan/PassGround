-- 앱 푸시 알림을 받을 기기 목록. 서버(service role)만 읽고 쓴다.
create table if not exists public.push_devices (
  token text primary key,
  user_id uuid,
  platform text not null default 'ios',
  environment text not null default 'production',
  news_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_devices_environment_check check (environment in ('sandbox', 'production'))
);

create index if not exists push_devices_news_idx on public.push_devices (news_enabled) where news_enabled;

alter table public.push_devices enable row level security;
