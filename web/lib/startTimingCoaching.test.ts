import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { buildStartTimingGuide, isStartTimingQuestion, kstNow, startSeason } from "./startTimingCoaching.ts";

test("준비 시작 시점을 묻는 질문을 알아본다", () => {
  for (const question of [
    "나 편입 이제 시작하는데 이거 되냐",
    "10월부터 시작해도 될까?",
    "지금 시작하면 늦었나요",
    "편입 준비 이제야 시작했는데 가능할까",
  ]) assert.equal(isStartTimingQuestion(question), true, question);
  for (const question of ["순공 몇 시간 해야 돼?", "충남대 간호학과 모집요강 알려줘", "시작이 반이다"]) {
    assert.equal(isStartTimingQuestion(question), false, question);
  }
});

test("한국시간 기준 월로 시기를 나눈다", () => {
  assert.deepEqual(kstNow(new Date("2026-09-30T16:00:00Z")), { year: 2026, month: 10, day: 1 });
  assert.equal(startSeason(1), "after_exam");
  assert.equal(startSeason(4), "early");
  assert.equal(startSeason(8), "summer");
  assert.equal(startSeason(10), "late");
});

test("10월 질문에는 계열별 냉정한 방침과 오늘 날짜가 들어간다", () => {
  const guide = buildStartTimingGuide(new Date("2026-10-17T03:00:00Z"));
  assert.match(guide, /2026년 10월 17일/);
  assert.match(guide, /자연계: .*다음 편입 시험/);
  assert.match(guide, /인문계: .*독해력.*단어 위주/);
  assert.match(guide, /인서울/);
  assert.doesNotMatch(buildStartTimingGuide(new Date("2026-07-10T03:00:00Z")), /다음 편입 시험을 준비/);
});
