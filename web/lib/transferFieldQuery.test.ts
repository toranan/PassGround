import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { asksFieldInfo, detectTransferField, detectWrittenSubject, isFieldAbbreviation, scopeMatchesField, writtenSubjectsInclude } from "./transferFieldQuery.ts";

test("학교 없이 계열을 묻는 질문을 알아보고, 계열 줄임말은 대학 이름으로 보지 않는다", () => {
  assert.equal(detectTransferField("체대 편입 정보 다 줘")?.key, "pe");
  assert.equal(detectTransferField("체육교육과 편입 어디서 뽑아?")?.key, "pe");
  assert.equal(detectTransferField("약대 편입 전형 알려줘")?.key, "pharmacy");
  assert.equal(detectTransferField("수의대 편입 어디서 뽑아")?.key, "veterinary");
  assert.equal(detectTransferField("약대편입")?.key, "pharmacy");
  for (const question of ["약대편입", "간호 편입?", "약대 편입 어떻게 나가냐", "수의대"]) assert.equal(asksFieldInfo(question), true, question);
  for (const question of ["약대 편입 너무 힘들다", "간호 편입 공부 어떻게 해?", "한양대 간호학과 갈수있을꺼?", "음악 들으면서 공부해도 돼?"]) assert.equal(asksFieldInfo(question), false, question);
  assert.equal(isFieldAbbreviation("체대"), true);
  assert.equal(isFieldAbbreviation("충남대"), false);
});

test("제외 목록에만 나오는 학과는 해당 계열 전형으로 보지 않는다", () => {
  const pe = detectTransferField("체대 편입 정보 다 줘")!;
  assert.equal(scopeMatchesField("사범대학 체육교육과", pe), true);
  assert.equal(scopeMatchesField("인천대 공연예술학과·스포츠과학부·체육교육과", pe), true);
  assert.equal(scopeMatchesField("모든 모집단위(수의학과·간호학과·체육교육과 제외)", pe), false);
  const medicine = detectTransferField("의대 편입 정보 알려줘")!;
  assert.equal(scopeMatchesField("수의학과", medicine), false);
  assert.equal(scopeMatchesField("의학과", medicine), true);
});

test("의치한약수 묶음과 필기 과목 조건을 알아본다", () => {
  const medical = detectTransferField("수학 반영 의치한약수 편입 정보 알려줘")!;
  assert.equal(medical.key, "medical");
  assert.equal(detectWrittenSubject("수학 반영 의치한약수 편입 정보 알려줘"), "수학");
  assert.equal(detectWrittenSubject("의치한약수 편입 정보"), null);
  for (const scope of ["약학과", "수의학과", "의학과", "약학대학 약학과·제약학과"]) assert.equal(scopeMatchesField(scope, medical), true, scope);
  assert.equal(scopeMatchesField("계약학과 발전공학과", medical), false);
  assert.equal(scopeMatchesField("계약학과 발전공학과", detectTransferField("약대 편입 전형 알려줘")!), false);
  assert.equal(writtenSubjectsInclude(["영어", "수학"], "수학"), true);
  assert.equal(writtenSubjectsInclude(["일반화학", "일반생물학"], "수학"), false);
});
