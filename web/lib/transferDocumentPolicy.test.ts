import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { admissionScopeStatus, basicPlanNotice, documentBasisSummary, isBasicPlan, missingAdmissionEvidence, noAdmissionDocument, normalizeTransferUniversityName } from "./transferDocumentPolicy.ts";

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
  // 공개 여부는 '수집된 자료 기준'으로만 말하고 대학이 공개하지 않았다고 단정하지 않는다.
  assert.match(noAdmissionDocument("2027학년도 인천대학교"), /현재까지 수집된 2027학년도 인천대학교 자료 기준으로는/);
  assert.match(noAdmissionDocument("학교"), /입학처 공지도 함께 확인/);
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
  assert.match(status, /최종 모집요강이 나온 곳은 아직 없어요/);
  assert.match(status, /충남대학교·충북대학교: 기본계획이 나와 있어/);
  assert.match(status, /을지대·한림대·건양대: 현재까지 수집된 2027학년도 자료 기준으로는/);
  assert.doesNotMatch(status, /공개되지 않/);
});
test("최종 모집요강 → 기본계획 순으로 학교별 기준을 밝힌다", () => {
  assert.match(documentBasisSummary([basic]), /모두 편입학 기본계획 기준/);
  assert.match(documentBasisSummary([{ university: "고려대학교", document_type: "필기고사 과목·출제범위(안)" }]), /모두 편입학 기본계획 기준/);
  assert.equal(documentBasisSummary([final]), "모두 최종 모집요강 기준이에요.");
  assert.match(
    documentBasisSummary([final, { university: "숙명여자대학교", document_type: "전형 기본계획" }]),
    /최종 모집요강 기준: 연세대학교 \/ 편입학 기본계획 기준\(변경 가능\): 숙명여자대학교\./
  );
});
