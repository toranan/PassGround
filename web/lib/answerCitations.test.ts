import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { selectAnswerCitations } from "./answerCitations.ts";

const sookmyung = {
  university: "숙명여자대학교",
  documentTitle: "2027학년도 숙명여자대학교 학사·일반편입학 전형 기본계획",
  sha256: "a".repeat(64),
};

test("답에 쓰인 숫자·단어가 겹치는 근거만 페이지와 하이라이트로 고른다", () => {
  const answer = "숙명여대 약학부는 영어 33문항과 수학 22문항을 100분 동안 봐.";
  const citations = selectAnswerCitations(answer, [
    { ...sookmyung, pages: [1], text: "약학부는 100분 55문항으로 영어 33문항과 수학 22문항이다." },
    { ...sookmyung, pages: [2], text: "인문계열 전체는 60분 영어 33문항이다." },
  ]);
  assert.equal(citations.length, 1);
  assert.equal(citations[0].page, 1);
  assert.deepEqual(citations[0].highlights.slice(0, 3), ["100분", "33문항", "22문항"]);
});

test("답에 학교 이름이 없거나 숫자가 하나만 우연히 겹치면 근거로 쓰지 않는다", () => {
  const source = { ...sookmyung, pages: [1], text: "1단계 필답고사 100%로 10배수를 선발한다." };
  assert.equal(selectAnswerCitations("1단계는 10배수를 뽑아.", [source]).length, 0);
  assert.equal(selectAnswerCitations("숙명여대는 10배수야.", [{ ...source, text: "10배수" }]).length, 0);
});

test("숫자 없는 학과 목록 답은 학과명이 셋 이상 겹칠 때만 근거로 쓴다", () => {
  const source = { ...sookmyung, pages: [1], text: "필답고사 수학: 화학과, 수학과, 통계학과, 화공생명공학부, 기계시스템학부" };
  const listed = selectAnswerCitations("숙명여대는 화학과·통계학과·화공생명공학부가 수학만 봐.", [source]);
  assert.equal(listed.length, 1);
  assert.ok(listed[0].highlights.includes("화공생명공학부"));
  assert.equal(selectAnswerCitations("숙명여대 통계학과는 수학만 봐.", [source]).length, 0);
});

test("앞자리 숫자에 붙은 일치는 무시하고, 문서당 근거 수를 제한한다", () => {
  const kangwon = { university: "강원대학교 춘천캠퍼스", documentTitle: "강원대 기본계획", sha256: "b".repeat(64) };
  const answer = "강원대 수의학과는 일반생물학·일반화학 50문항 60분이고, 2단계는 필기 70%·영어 30%야.";
  const citations = selectAnswerCitations(answer, [
    { ...kangwon, pages: [5], text: "필기고사 일반생물학과 일반화학 50문항 60분, 2단계 필기 70% 공인영어 30%" },
    { ...kangwon, pages: [6], text: "수의학과 필기 50문항 60분 일반생물학" },
    { ...kangwon, pages: [9], text: "실기 0% 춘천캠퍼스 60분 50문항" },
  ]);
  assert.equal(citations.length, 2);
  assert.equal(citations[0].page, 5);
  assert.ok(!citations.flatMap((citation) => citation.highlights).includes("0%"));
  assert.ok(!citations.flatMap((citation) => citation.highlights).includes("춘천캠퍼스"));
});
