# 편입 모집요강 적재 파이프라인

## 원칙

`*.verified.json` 하나를 검증된 정답 소스로 관리한다.

- `ai_source_documents`, `ai_source_sections`, `transfer_programs`, `transfer_selection_rules`,
  `transfer_schedule_events`는 검증 원본을 보관한다.
- `ai_knowledge_items`, `ai_knowledge_chunks`는 manifest에서 자동 생성하는 검색 인덱스다.
- 수정은 manifest만 하고 재적재한다. 파생 청크를 수동으로 고치지 않는다.
- PDF가 개정되면 새 SHA-256로 manifest를 만든다. 성공적으로 적재된 후
  이전 문서는 `superseded`, 이전 검색 지식은 `pending`으로 비활성화된다.

## 최초 DB 설정

Supabase SQL Editor에서 다음 파일을 1회 실행한다.

```text
web/supabase_transfer_admission_catalog.sql
```

기존 `supabase_ai_knowledge.sql`, `supabase_ai_rag.sql`이 적용된 DB를 기준으로 한다.

## 한양대 2026 manifest 검증

DB와 임베딩 API를 호출하지 않는 dry-run:

```bash
cd web
npm run transfer:ingest -- \
  ../docs/knowledge-extractions/2026-hanyang-transfer.verified.json \
  --pdf '/absolute/path/to/2026학년도 한양대학교 편입학 모집요강.pdf'
```

dry-run은 다음을 검증한다.

- JSON 스키마와 필수값
- PDF 파일 크기와 SHA-256
- 섹션·전형규칙·일정·모집단위 key 중복
- 모집인원 행 수와 일반·학사·간호야간 합계
- manifest에서 생성될 지식 항목과 청크 수

## 실제 적재

`.env.local`에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`를 설정한 후
dry-run 명령에 `--commit`을 붙인다.

```bash
npm run transfer:ingest -- \
  ../docs/knowledge-extractions/2026-hanyang-transfer.verified.json \
  --pdf '/absolute/path/to/source.pdf' \
  --commit
```

적재 순서는 다음과 같다.

1. manifest와 PDF checksum을 검증한다.
2. 모든 파생 청크의 임베딩을 DB 변경 전에 생성한다.
3. 문서를 임시 `archived`로 적재하고 구조화 행을 upsert한다.
4. manifest에서 섹션·전형규칙·일정·단과대별 모집인원 지식을 생성한다.
5. 구조화 행과 검색 청크가 모두 성공하면 지식을 `approved`, 문서를 `active`로 전환한다.
6. 사라진 manifest 항목과 이전 문서의 청크를 비활성화한다.

## 종합 질의

`수학만 보는 학교 나열해줘`, `영어·수학 둘 다 보는 대학 알려줘`는
`transfer_selection_rules`를 조회한다. 답변은 필기과목과 최종 서류·면접 반영비율을
구분하고 PDF 페이지를 표시한다. 아직 적재되지 않은 학교를 없다고 판정하지 않도록
답변에 현재 커버리지 학교 수를 함께 표시한다.

카탈로그 테이블이 아직 없는 배포에서는 채팅 API가 기존 벡터 RAG로 자동 폴백한다.
