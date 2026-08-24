-- 편입 모집요강용 검증 문서 + 원자 지식 단위 저장소.
--
-- 원칙
-- 1. source_documents는 어떤 학교/학년도의 모집요강이 검증·활성 상태인지 관리한다.
-- 2. transfer_knowledge_units는 구조화 값, 원문 근거, 키워드 인덱스, 임베딩을 한 행에 둔다.
-- 3. 사용자 질문에서 학교/학년도를 먼저 확정한 뒤 이 테이블만 검색한다.
-- 4. 벡터 인덱스는 관련 근거를 찾는 용도이며 목록의 전체성·숫자 계산은 typed 컬럼으로 처리한다.

create extension if not exists vector;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.ai_source_documents (
  id uuid primary key default gen_random_uuid(),
  exam_slug text not null default 'transfer',
  university text not null,
  campus text not null default '',
  admission_year int not null,
  document_type text not null,
  title text not null,
  source_file text not null,
  source_url text,
  sha256 text not null,
  file_size_bytes bigint,
  page_count int not null,
  review_status text not null default 'pending',
  lifecycle_status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_source_documents_sha256_unique unique (sha256),
  constraint ai_source_documents_year_check check (admission_year between 2020 and 2100),
  constraint ai_source_documents_page_count_check check (page_count > 0),
  constraint ai_source_documents_review_status_check check (review_status in ('pending', 'verified', 'rejected')),
  constraint ai_source_documents_lifecycle_status_check check (lifecycle_status in ('active', 'superseded', 'archived')),
  constraint ai_source_documents_sha256_check check (sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists ai_source_documents_lookup_idx
  on public.ai_source_documents (exam_slug, admission_year desc, university, campus, lifecycle_status);

create table if not exists public.transfer_knowledge_units (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.ai_source_documents(id) on delete cascade,
  unit_key text not null,
  chunk_index int not null default 0,
  unit_type text not null,

  -- 자주 필터링하는 공통 엔티티
  university text not null,
  campus text not null default '',
  admission_year int not null,
  college text,
  category text,
  major text,
  scope_type text,
  scope_value text,
  transfer_types text[] not null default '{}',
  written_subjects text[] not null default '{}',

  -- 모집인원
  general_count int,
  bachelor_count int,
  nursing_night_count int,

  -- 전형요소
  exam_minutes int,
  question_count int,
  exam_format text,
  stage1_written_weight numeric(5,2),
  final_written_weight numeric(5,2),
  final_document_weight numeric(5,2),
  final_interview_weight numeric(5,2),
  final_practical_weight numeric(5,2),
  stage1_selection_min_multiple int,
  stage1_selection_max_multiple int,

  -- 자연계 추가지원자격 공인영어 기준
  english_toeic_min int,
  english_teps_min int,
  english_toefl_ibt_min int,
  english_score_valid_from date,
  english_score_valid_through date,

  -- 일정: 시각이 명시되지 않은 날짜에 임의의 00:00/23:59:59를 넣지 않는다.
  event_label text,
  event_audience text,
  starts_on date,
  ends_on date,
  starts_at timestamptz,
  ends_at timestamptz,

  -- 검색 근거
  content text not null,
  source_pages int[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  text_search tsvector generated always as (to_tsvector('simple', coalesce(content, ''))) stored,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint transfer_knowledge_units_unique unique (document_id, unit_key, chunk_index),
  constraint transfer_knowledge_units_type_check check (
    unit_type in ('section', 'selection_rule', 'program', 'schedule')
  ),
  constraint transfer_knowledge_units_chunk_check check (chunk_index >= 0),
  constraint transfer_knowledge_units_year_check check (admission_year between 2020 and 2100),
  constraint transfer_knowledge_units_scope_check check (
    scope_type is null or scope_type in ('all', 'category', 'college', 'major')
  ),
  constraint transfer_knowledge_units_counts_check check (
    (general_count is null or general_count >= 0)
    and (bachelor_count is null or bachelor_count >= 0)
    and (nursing_night_count is null or nursing_night_count >= 0)
  ),
  constraint transfer_knowledge_units_exam_check check (
    (exam_minutes is null or exam_minutes > 0)
    and (question_count is null or question_count > 0)
  ),
  constraint transfer_knowledge_units_weights_check check (
    (stage1_written_weight is null or stage1_written_weight between 0 and 100)
    and (final_written_weight is null or final_written_weight between 0 and 100)
    and (final_document_weight is null or final_document_weight between 0 and 100)
    and (final_interview_weight is null or final_interview_weight between 0 and 100)
    and (final_practical_weight is null or final_practical_weight between 0 and 100)
  ),
  constraint transfer_knowledge_units_selection_multiple_check check (
    (stage1_selection_min_multiple is null or stage1_selection_min_multiple > 0)
    and (stage1_selection_max_multiple is null or stage1_selection_max_multiple > 0)
    and (
      stage1_selection_min_multiple is null
      or stage1_selection_max_multiple is null
      or stage1_selection_max_multiple >= stage1_selection_min_multiple
    )
  ),
  constraint transfer_knowledge_units_english_score_check check (
    (english_toeic_min is null or english_toeic_min >= 0)
    and (english_teps_min is null or english_teps_min >= 0)
    and (english_toefl_ibt_min is null or english_toefl_ibt_min >= 0)
    and (
      english_score_valid_from is null
      or english_score_valid_through is null
      or english_score_valid_through >= english_score_valid_from
    )
  ),
  constraint transfer_knowledge_units_schedule_check check (
    (ends_at is null or starts_at is null or ends_at >= starts_at)
    and (ends_on is null or starts_on is null or ends_on >= starts_on)
  )
);

create index if not exists transfer_knowledge_units_scope_idx
  on public.transfer_knowledge_units (admission_year desc, university, campus, unit_type);

create index if not exists transfer_knowledge_units_document_idx
  on public.transfer_knowledge_units (document_id, unit_key, chunk_index);

create index if not exists transfer_knowledge_units_program_idx
  on public.transfer_knowledge_units (admission_year desc, university, major)
  where unit_type = 'program';

create index if not exists transfer_knowledge_units_subjects_gin_idx
  on public.transfer_knowledge_units using gin (written_subjects);

create index if not exists transfer_knowledge_units_types_gin_idx
  on public.transfer_knowledge_units using gin (transfer_types);

create index if not exists transfer_knowledge_units_fts_gin_idx
  on public.transfer_knowledge_units using gin (text_search);

create index if not exists transfer_knowledge_units_embedding_hnsw_idx
  on public.transfer_knowledge_units
  using hnsw (embedding vector_cosine_ops);

drop trigger if exists set_ai_source_documents_updated_at on public.ai_source_documents;
create trigger set_ai_source_documents_updated_at
before update on public.ai_source_documents
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_transfer_knowledge_units_updated_at on public.transfer_knowledge_units;
create trigger set_transfer_knowledge_units_updated_at
before update on public.transfer_knowledge_units
for each row execute function public.set_current_timestamp_updated_at();

-- 활성·검증 문서 범위. "전체 학교" 답변에는 이 뷰의 학교 수를 반드시 표시한다.
create or replace view public.transfer_catalog_coverage as
select
  admission_year,
  university,
  campus,
  document_type,
  title,
  source_url,
  verified_at,
  count(*) over (partition by admission_year) as covered_documents
from public.ai_source_documents
where exam_slug = 'transfer'
  and review_status = 'verified'
  and lifecycle_status = 'active';

-- 학교·학년도 범위를 먼저 제한한 뒤 의미 검색한다.
-- 반환 열이 바뀌어도 이 파일을 다시 실행할 수 있도록 기존 함수를 먼저 제거한다.
drop function if exists public.match_transfer_knowledge_units(vector, uuid[], text[], int, float);

create function public.match_transfer_knowledge_units(
  query_embedding vector(1536),
  query_document_ids uuid[],
  query_unit_types text[] default null,
  match_count int default 8,
  min_similarity float default 0.35
)
returns table (
  id uuid,
  document_id uuid,
  unit_key text,
  chunk_index int,
  unit_type text,
  university text,
  campus text,
  admission_year int,
  college text,
  category text,
  major text,
  scope_type text,
  scope_value text,
  transfer_types text[],
  written_subjects text[],
  general_count int,
  bachelor_count int,
  nursing_night_count int,
  exam_minutes int,
  question_count int,
  exam_format text,
  stage1_written_weight numeric,
  final_written_weight numeric,
  final_document_weight numeric,
  final_interview_weight numeric,
  final_practical_weight numeric,
  stage1_selection_min_multiple int,
  stage1_selection_max_multiple int,
  english_toeic_min int,
  english_teps_min int,
  english_toefl_ibt_min int,
  english_score_valid_from date,
  english_score_valid_through date,
  event_label text,
  event_audience text,
  starts_on date,
  ends_on date,
  starts_at timestamptz,
  ends_at timestamptz,
  content text,
  source_pages int[],
  metadata jsonb,
  similarity float
)
language sql
stable
security invoker
as $$
  select
    u.id,
    u.document_id,
    u.unit_key,
    u.chunk_index,
    u.unit_type,
    u.university,
    u.campus,
    u.admission_year,
    u.college,
    u.category,
    u.major,
    u.scope_type,
    u.scope_value,
    u.transfer_types,
    u.written_subjects,
    u.general_count,
    u.bachelor_count,
    u.nursing_night_count,
    u.exam_minutes,
    u.question_count,
    u.exam_format,
    u.stage1_written_weight,
    u.final_written_weight,
    u.final_document_weight,
    u.final_interview_weight,
    u.final_practical_weight,
    u.stage1_selection_min_multiple,
    u.stage1_selection_max_multiple,
    u.english_toeic_min,
    u.english_teps_min,
    u.english_toefl_ibt_min,
    u.english_score_valid_from,
    u.english_score_valid_through,
    u.event_label,
    u.event_audience,
    u.starts_on,
    u.ends_on,
    u.starts_at,
    u.ends_at,
    u.content,
    u.source_pages,
    u.metadata,
    1 - (u.embedding <=> query_embedding) as similarity
  from public.transfer_knowledge_units u
  join public.ai_source_documents d on d.id = u.document_id
  where d.review_status = 'verified'
    and d.lifecycle_status = 'active'
    -- 범위 없는 전역 벡터 검색을 금지한다. 앱이 검증 문서 ID를 먼저 확정해야 한다.
    and cardinality(query_document_ids) > 0
    and u.document_id = any(query_document_ids)
    and (query_unit_types is null or u.unit_type = any(query_unit_types))
    and (1 - (u.embedding <=> query_embedding)) >= min_similarity
  order by u.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

alter table public.ai_source_documents enable row level security;
alter table public.transfer_knowledge_units enable row level security;

-- 클라이언트가 모집요강 원본과 임베딩을 직접 읽지 못하게 한다.
-- 서버의 service_role만 RLS를 우회해 적재·조회한다.
revoke all on public.ai_source_documents from anon, authenticated;
revoke all on public.transfer_knowledge_units from anon, authenticated;
revoke all on public.transfer_catalog_coverage from anon, authenticated;
revoke execute on function public.match_transfer_knowledge_units(vector, uuid[], text[], int, float)
  from public, anon, authenticated;
grant execute on function public.match_transfer_knowledge_units(vector, uuid[], text[], int, float)
  to service_role;
