import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { basicPlanNotice, isBasicPlan, missingAdmissionEvidence, noAdmissionDocument, normalizeTransferUniversityName } from "./transferDocumentPolicy.ts";

const basic = { university: "연세대학교", document_type: "전형 기본계획" };
const final = { university: "연세대학교", document_type: "최종 모집요강" };
test("기본계획은 임시 근거로 표시하고 최종 요강에는 표시하지 않는다", () => {
  assert.equal(isBasicPlan(basic), true);
  assert.equal(isBasicPlan(final), false);
  assert.match(basicPlanNotice([basic]), /변경될 수/);
  assert.equal(basicPlanNotice([final]), "");
});
test("대학 약칭을 모집요강 문서명과 같은 키로 정규화한다", () => {
  assert.equal(normalizeTransferUniversityName("성대"), "성균관대");
  assert.equal(normalizeTransferUniversityName("연대"), "연세대");
  assert.equal(normalizeTransferUniversityName("경상대"), "경상국립대");
});
test("검색 실패를 대학의 미공개 사실로 단정하지 않는다", () => {
  assert.match(missingAdmissionEvidence([basic]), /확인하지 못/);
  assert.match(noAdmissionDocument("2027학년도 인천대학교"), /서비스에 확보/);
  assert.doesNotMatch(noAdmissionDocument("학교"), /아직 공개되지/);
});
