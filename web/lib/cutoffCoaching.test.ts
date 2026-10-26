import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { buildCutoffGuide, isCutoffQuestion } from "./cutoffCoaching.ts";

test("커트라인·점수 합격 판정 질문을 알아본다", () => {
  for (const question of [
    "성균관대 소프트웨어학과 커트라인 알려줘",
    "중앙대 컷 몇 점이야?",
    "연세대 수물합 140점이면 합격?",
    "한양대 몇 점이면 붙어?",
    "건대 합격선 어느 정도야",
    "영수합 150점 나오면 인서울 가능해?",
  ]) assert.equal(isCutoffQuestion(question), true, question);
  for (const question of ["중앙대 시험 과목 알려줘", "토익 몇 점 필요해?", "수학만 보는 학교 알려줘", "학점 3.0인데 괜찮아?"]) {
    assert.equal(isCutoffQuestion(question), false, question);
  }
});

test("커트라인을 만들지 않고 이유와 현재 위치 확인 방법을 안내한다", () => {
  const guide = buildCutoffGuide();
  assert.match(guide, /공식 커트라인을 공개하는 학교가 거의 없다/);
  assert.match(guide, /학과마다 합격 점수가 다르다/);
  assert.match(guide, /김영편입 모의고사/);
  assert.match(guide, /만들어 말하지 않는다/);
  assert.match(guide, /그대로 외워 반복하지 말고/);
});
