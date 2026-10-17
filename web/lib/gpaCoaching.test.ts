import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { buildGpaGuide, isGpaQuestion } from "./gpaCoaching.ts";

test("학점 상담 질문을 알아본다", () => {
  for (const question of [
    "냉정하게 말해봐 솔직하게 F학점이있는데 편입가능해?",
    "f 있는데 편입 되나요",
    "학점 낮은데 편입에 영향 커?",
    "학점 2점대인데 괜찮아?",
    "편입할 때 학점도 봐?",
  ]) assert.equal(isGpaQuestion(question), true, question);
  for (const question of ["충북대 지원자격 몇 학점 필요해?", "토익 보는 자연계 학교 알려줘", "if문 공부법"]) {
    assert.equal(isGpaQuestion(question), false, question);
  }
});

test("필기 중심 원칙과 F학점의 이수학점 문제, 전적대 성적 반영 예외를 담는다", () => {
  const guide = buildGpaGuide();
  assert.match(guide, /필기시험이 합격에 가장 큰 영향/);
  assert.match(guide, /학점을 취득하지 못했다는 점/);
  assert.match(guide, /전적대 성적 100%/);
  assert.match(guide, /지어내지 않는다/);
});
