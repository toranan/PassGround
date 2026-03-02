-- Exam schedules table for iOS/Web "일정" tab.
-- Run in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.exam_schedules (
  id uuid primary key default gen_random_uuid(),
  exam_slug text not null,
  university text,
  title text not null,
  category text not null default '원서접수',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  organizer text,
  link_url text,
  is_official boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_schedules_exam_slug_check check (exam_slug in ('transfer', 'cpa')),
  constraint exam_schedules_time_check check (ends_at is null or ends_at >= starts_at),
  constraint exam_schedules_unique unique (exam_slug, title, starts_at)
);

alter table public.exam_schedules
  add column if not exists university text;

create index if not exists exam_schedules_exam_starts_idx
  on public.exam_schedules (exam_slug, starts_at asc);

drop trigger if exists exam_schedules_set_updated_at on public.exam_schedules;
create trigger exam_schedules_set_updated_at
before update on public.exam_schedules
for each row execute function public.set_updated_at();

alter table public.exam_schedules enable row level security;

drop policy if exists exam_schedules_read on public.exam_schedules;
create policy exam_schedules_read
on public.exam_schedules
for select
using (true);

drop policy if exists exam_schedules_insert_admin on public.exam_schedules;
create policy exam_schedules_insert_admin
on public.exam_schedules
for insert
with check (public.is_admin());

drop policy if exists exam_schedules_update_admin on public.exam_schedules;
create policy exam_schedules_update_admin
on public.exam_schedules
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists exam_schedules_delete_admin on public.exam_schedules;
create policy exam_schedules_delete_admin
on public.exam_schedules
for delete
using (public.is_admin());

-- =============================================================
-- Official schedule insert/update examples
-- =============================================================
-- Add new rows:
insert into public.exam_schedules (
  exam_slug, university, title, category, starts_at, ends_at, location, organizer, link_url, is_official, note
)
values
  (
    'transfer',
    null,
    '2027학년도 편입 원서접수',
    '원서접수',
    '2026-11-30 00:00:00+09',
    '2026-12-03 23:59:59+09',
    '각 대학 입학처',
    '대학별 입학처',
    null,
    true,
    '대학별 접수 기간 상이'
  ),
  (
    'transfer',
    null,
    '2027학년도 편입 필기시험',
    '시험',
    '2026-12-20 09:00:00+09',
    '2027-01-12 18:00:00+09',
    '대학별 고사장',
    '대학별 입학처',
    null,
    true,
    '지원 대학 고사일 확인 필수'
  )
on conflict (exam_slug, title, starts_at) do update
set
  category = excluded.category,
  ends_at = excluded.ends_at,
  location = excluded.location,
  organizer = excluded.organizer,
  link_url = excluded.link_url,
  is_official = excluded.is_official,
  note = excluded.note,
  updated_at = now();

-- Update one existing schedule:
-- update public.exam_schedules
-- set link_url = 'https://admission.example.ac.kr/notice/123', updated_at = now()
-- where exam_slug = 'transfer' and title = '2027학년도 편입 원서접수';

-- Delete one schedule:
-- delete from public.exam_schedules
-- where exam_slug = 'transfer' and title = '2027학년도 편입 원서접수';
