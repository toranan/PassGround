-- 목표대학 + 대학별 일정 컬럼 추가
-- Supabase SQL Editor에서 1회 실행

alter table public.profiles
  add column if not exists target_university text;

alter table public.exam_schedules
  add column if not exists university text;

create index if not exists exam_schedules_exam_university_starts_idx
  on public.exam_schedules (exam_slug, university, starts_at asc);
