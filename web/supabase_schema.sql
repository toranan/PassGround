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

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'user_role'
      and n.nspname = 'public'
  ) then
    create type public.user_role as enum ('admin', 'moderator');
  end if;
end;
$$;

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

-- =============================================================
-- MVP EXTENSION (Transfer + CPA)
-- =============================================================

alter table public.posts
  add column if not exists view_count int not null default 0,
  add column if not exists post_type text not null default 'general',
  add column if not exists is_ai_digest boolean not null default false;

alter table public.profiles
  add column if not exists points int not null default 0,
  add column if not exists verification_level text not null default 'none',
  add column if not exists verified_at timestamptz,
  add column if not exists verification_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_verification_level_check'
  ) then
    alter table public.profiles
      add constraint profiles_verification_level_check
      check (verification_level in ('none', 'transfer_passer', 'cpa_first_passer', 'cpa_accountant'));
  end if;
end;
$$;

create table if not exists public.cutoff_scores (
  id uuid primary key default gen_random_uuid(),
  exam_slug text not null,
  university text not null,
  major text not null,
  year int not null,
  score_band text not null,
  note text,
  source text,
  created_at timestamptz not null default now(),
  unique (exam_slug, university, major, year)
);

create table if not exists public.instructor_rankings (
  id uuid primary key default gen_random_uuid(),
  exam_slug text not null,
  subject text not null,
  instructor_name text not null,
  rank int not null,
  trend text default '-',
  confidence int default 0,
  source_type text default 'seed',
  is_seed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (exam_slug, subject, instructor_name)
);

create table if not exists public.daily_briefings (
  id uuid primary key default gen_random_uuid(),
  exam_slug text not null,
  title text not null,
  summary text not null,
  source_label text not null,
  published_at date not null,
  created_at timestamptz not null default now(),
  unique (exam_slug, title, published_at)
);

create table if not exists public.answer_adoptions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  adopter_name text not null,
  selected_author_name text not null,
  points_awarded int not null default 0,
  created_at timestamptz not null default now(),
  unique (post_id)
);

create table if not exists public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  receiver_name text not null,
  source text not null,
  amount int not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  requester_name text not null,
  exam_slug text not null,
  verification_type text not null,
  evidence_url text not null,
  memo text,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (status in ('pending', 'approved', 'rejected'))
);

create table if not exists public.instructor_votes (
  id uuid primary key default gen_random_uuid(),
  exam_slug text not null,
  instructor_name text not null,
  voter_name text not null,
  created_at timestamptz not null default now(),
  unique (exam_slug, instructor_name, voter_name)
);

create index if not exists cutoff_scores_exam_year_idx on public.cutoff_scores (exam_slug, year desc);
create index if not exists instructor_rankings_exam_rank_idx on public.instructor_rankings (exam_slug, rank asc);
create index if not exists daily_briefings_exam_date_idx on public.daily_briefings (exam_slug, published_at desc);
create index if not exists answer_adoptions_post_idx on public.answer_adoptions (post_id);
create index if not exists point_ledger_profile_idx on public.point_ledger (profile_id);
create index if not exists point_ledger_receiver_idx on public.point_ledger (receiver_name);
create index if not exists verification_requests_status_idx on public.verification_requests (status, created_at desc);

create or replace function public.increment_profile_points(target_profile_id uuid, points_delta integer)
returns void
language plpgsql
as $$
begin
  update public.profiles
  set points = coalesce(points, 0) + points_delta,
      updated_at = now()
  where id = target_profile_id;
end;
$$;

alter table public.cutoff_scores enable row level security;
alter table public.instructor_rankings enable row level security;
alter table public.daily_briefings enable row level security;
alter table public.answer_adoptions enable row level security;
alter table public.point_ledger enable row level security;
alter table public.verification_requests enable row level security;
alter table public.instructor_votes enable row level security;

drop policy if exists "cutoff_scores_read" on public.cutoff_scores;
create policy "cutoff_scores_read" on public.cutoff_scores
for select using (true);

drop policy if exists "cutoff_scores_write_admin" on public.cutoff_scores;
create policy "cutoff_scores_write_admin" on public.cutoff_scores
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "instructor_rankings_read" on public.instructor_rankings;
create policy "instructor_rankings_read" on public.instructor_rankings
for select using (true);

drop policy if exists "instructor_rankings_write_admin" on public.instructor_rankings;
create policy "instructor_rankings_write_admin" on public.instructor_rankings
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "daily_briefings_read" on public.daily_briefings;
create policy "daily_briefings_read" on public.daily_briefings
for select using (true);

drop policy if exists "daily_briefings_write_admin" on public.daily_briefings;
create policy "daily_briefings_write_admin" on public.daily_briefings
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "answer_adoptions_read" on public.answer_adoptions;
create policy "answer_adoptions_read" on public.answer_adoptions
for select using (true);

drop policy if exists "answer_adoptions_insert" on public.answer_adoptions;
create policy "answer_adoptions_insert" on public.answer_adoptions
for insert with check (true);

drop policy if exists "answer_adoptions_modify_admin" on public.answer_adoptions;
create policy "answer_adoptions_modify_admin" on public.answer_adoptions
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "point_ledger_read" on public.point_ledger;
create policy "point_ledger_read" on public.point_ledger
for select using (true);

drop policy if exists "point_ledger_insert" on public.point_ledger;
create policy "point_ledger_insert" on public.point_ledger
for insert with check (true);

drop policy if exists "verification_requests_insert" on public.verification_requests;
create policy "verification_requests_insert" on public.verification_requests
for insert with check (true);

drop policy if exists "verification_requests_admin_read" on public.verification_requests;
create policy "verification_requests_admin_read" on public.verification_requests
for select using (public.is_admin());

drop policy if exists "verification_requests_admin_write" on public.verification_requests;
create policy "verification_requests_admin_write" on public.verification_requests
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "instructor_votes_read" on public.instructor_votes;
create policy "instructor_votes_read" on public.instructor_votes
for select using (true);

drop policy if exists "instructor_votes_insert" on public.instructor_votes;
create policy "instructor_votes_insert" on public.instructor_votes
for insert with check (true);

drop policy if exists "instructor_votes_delete_admin" on public.instructor_votes;
create policy "instructor_votes_delete_admin" on public.instructor_votes
for delete using (public.is_admin());

-- Seed data for MVP first launch
insert into public.cutoff_scores (exam_slug, university, major, year, score_band, note, source)
values
  ('transfer', '중앙대학교', '전자전기공학부', 2025, '90.8 ~ 92.1', '일반편입 기준, 면접 반영 포함', 'seed'),
  ('transfer', '건국대학교', '경영학과', 2025, '87.5 ~ 89.2', '전적대 성적/영어 가중치 반영', 'seed'),
  ('transfer', '한양대학교', '기계공학부', 2024, '88.7 ~ 90.0', '최초/추합 데이터 통합', 'seed'),
  ('transfer', '서강대학교', '경제학부', 2025, '91.2 ~ 92.8', '합격수기 언급 + 인증 데이터 교차 검증', 'seed')
on conflict (exam_slug, university, major, year) do nothing;

insert into public.instructor_rankings (exam_slug, subject, instructor_name, rank, trend, confidence, source_type, is_seed)
values
  ('transfer', '편입영어', '김OO', 1, '+3', 92, 'seed', true),
  ('transfer', '수학', '박OO', 2, '-', 88, 'seed', true),
  ('transfer', '전공', '이OO', 3, '+1', 81, 'seed', true),
  ('cpa', '재무회계', '정OO', 1, '+2', 95, 'seed', true),
  ('cpa', '세법', '최OO', 2, '-', 89, 'seed', true),
  ('cpa', '원가관리', '윤OO', 3, '+1', 84, 'seed', true)
on conflict (exam_slug, subject, instructor_name) do nothing;

insert into public.daily_briefings (exam_slug, title, summary, source_label, published_at)
values
  ('transfer', '중앙대 2026 편입 요강 일부 변경', '면접 반영 비율이 전년 대비 5%p 상향. 1단계 커트라인 예측치는 소폭 상승 가능성.', '대학 입학처 공지', current_date - 1),
  ('transfer', '주요 편입 학원 2월 모의고사 일정 공개', '상위권 대학 타깃 모의고사 일정이 집중 배치되어 실전 점검 주간으로 활용 권장.', '학원 공지 모음', current_date),
  ('cpa', '금감원 공지: 2026 1차 시험 유의사항 업데이트', '신분증 인정 범위와 입실 제한 시간 안내가 명확화. 시험장 반입 규정 재확인 필요.', '금융감독원', current_date),
  ('cpa', '주요 강의 플랫폼 추록 배포 현황', '재무회계/세법 추록 배포 시작, 최신 기준 반영 여부 주간 체크 권장.', '강의 플랫폼 공지', current_date - 1)
on conflict (exam_slug, title, published_at) do nothing;
