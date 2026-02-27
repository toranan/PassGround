# AI Chat Eval

## Run

```bash
npm run eval:ai
```

## Environment Variables

- `AI_EVAL_BASE_URL` (default: `http://localhost:3000`)
- `AI_EVAL_EXAM` (default: `transfer`)
- `AI_EVAL_CASES` (default: `./evals/ai-chat-cases.<exam>.json`)
- `AI_EVAL_MIN_PASS_RATE` (default: `0.8`)
- `AI_EVAL_DISABLE_CACHE` (`1` to bypass cache during eval)

## Example

```bash
AI_EVAL_BASE_URL=https://pass-ground.vercel.app AI_EVAL_EXAM=transfer npm run eval:ai
```
