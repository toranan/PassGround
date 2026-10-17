import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { detectTransferField, isFieldAbbreviation, scopeMatchesField } from "./transferFieldQuery.ts";

test("학교 없이 계열을 묻는 질문을 알아보고, 계열 줄임말은 대학 이름으로 보지 않는다", () => {
  assert.equal(detectTransferField("체대 편입 정보 다 줘")?.key, "pe");
  assert.equal(detectTransferField("체육교육과 편입 어디서 뽑아?")?.key, "pe");
  assert.equal(detectTransferField("약대 편입 전형 알려줘")?.key, "pharmacy");
  assert.equal(detectTransferField("수의대 편입 어디서 뽑아")?.key, "veterinary");
  assert.equal(detectTransferField("체대 가고 싶다"), null);
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
