# Dev Journal

## 2026-02-27

### What I changed
- Added incremental RAG indexing on knowledge approval/update (upsert only changed chunks).
- Added item-level chunk delete when knowledge is unapproved.
- Added CAG layer for `/api/ai/chat` with cache hit/miss/bypass flow.
- Added cache invalidation by approved knowledge revision (`count + latest updated_at`).
- Added Supabase SQL for `ai_chat_cache` table and indexes.
- Added observability fields in `/api/ai/chat` response (`traceId`, stage metrics).
- Added persistent observation sink (`ai_chat_observations`) for latency/cache/model metadata.
- Added AI regression eval runner (`npm run eval:ai`) with JSON test cases.
- Added multi-agent chat orchestration (`intent router + fact agent + emotion agent + mixed composer`).
- Restricted CAG usage to fact route only to avoid caching emotional replies.
- Added GitHub Actions workflow to auto-run eval when Vercel production deploy succeeds.
- Added SSE streaming mode for `/api/ai/chat` (`stream: true`) with incremental delta tokens.
- Added iOS chatbot tab (`AI 코치`) with `/api/ai/chat` integration and chat UX.

### Why it matters
- Reduced repeated embedding/search/generation for repeated fact questions.
- Kept answer path fail-open when cache read/write fails.
- Prepared a practical architecture story for production AI backend operation.
- Aligned runtime behavior with planned multi-agent architecture without adding new infra.

### Evidence and validation
- Type check: `npx tsc --noEmit --pretty false`
- Lint check on changed files: `npx eslint ...`
- Deployment smoke test: `/api/ai/chat` returned `200` with valid payload.

### Next actions
- Add cache metrics: hit ratio, latency delta, token saved.
- Add admin-level cache purge endpoint (exam-level / global).
- Add memory table for personalized coaching (opt-in summary memory).
- Add CI job to run `npm run eval:ai` against staging and block deploy on fail.

---

## Entry Template

### YYYY-MM-DD
- What I changed:
- Why:
- Metrics/Result:
- Issue encountered:
- How I fixed:
- What I learned:
