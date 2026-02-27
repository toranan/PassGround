-- Enforce one vote per account per exam.
-- Run once on production after deploying the vote API guard.

begin;

-- Keep the earliest vote per (exam_slug, voter_name), remove the rest.
delete from public.instructor_votes older
using public.instructor_votes newer
where older.exam_slug = newer.exam_slug
  and older.voter_name = newer.voter_name
  and (
    older.created_at > newer.created_at
    or (older.created_at = newer.created_at and older.id::text > newer.id::text)
  );

alter table public.instructor_votes
  drop constraint if exists instructor_votes_exam_slug_instructor_name_voter_name_key;

alter table public.instructor_votes
  add constraint instructor_votes_exam_slug_voter_name_key
  unique (exam_slug, voter_name);

commit;
