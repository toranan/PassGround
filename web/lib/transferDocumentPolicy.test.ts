import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { admissionScopeStatus, basicPlanNotice, isBasicPlan, missingAdmissionEvidence, noAdmissionDocument, normalizeTransferUniversityName } from "./transferDocumentPolicy.ts";

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
test("여러 학교 질문은 기본계획 학교와 미확보 학교를 나눠 밝힌다", () => {
  const status = admissionScopeStatus({
    year: 2027,
    documents: [
      { university: "충남대학교", document_type: "전형 기본계획" },
      { university: "충북대학교", document_type: "전형 기본계획" },
    ],
    missingUniversities: ["을지대", "한림대", "건양대"],
  });
  assert.match(status, /최종 모집요강이 확보된 곳은 아직 없어요/);
  assert.match(status, /충남대학교·충북대학교: 기본계획이 나와 있어/);
  assert.match(status, /을지대·한림대·건양대: 기본계획과 최종 모집요강 모두/);
  assert.doesNotMatch(status, /공개되지 않/);
});
