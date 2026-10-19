type DocumentBasis = {
  university: string;
  document_type: string;
  metadata?: Record<string, unknown> | null;
};

// 줄임말을 DB 학교명(예: 숙명여자대학교 → 숙명여대)과 같은 형태로 맞춘다.
const UNIVERSITY_SHORT_NAMES: Record<string, string> = {
  연대: "연세대",
  고대: "고려대",
  성대: "성균관대",
  건대: "건국대",
  경상대: "경상국립대",
  시립대: "서울시립대",
  과기대: "서울과학기술대",
  서울과기대: "서울과학기술대",
  외대: "한국외국어대",
  한국외대: "한국외국어대",
  항공대: "한국항공대",
};

export function normalizeTransferUniversityName(value: string): string {
  const normalized = value.toLowerCase().replace(/\s+/g, "").replace(/대학교$/, "대").replace(/여자대$/, "여대");
  return UNIVERSITY_SHORT_NAMES[normalized] ?? normalized;
}

// 최종 모집요강이 아닌 문서(기본계획·주요사항·필기과목 안내 등)는 모두 바뀔 수 있는 사전 안내로 본다.
export function isBasicPlan(document: DocumentBasis): boolean {
  return !["최종 모집요강", "모집요강"].includes(document.document_type);
}

export function basicPlanNotice(documents: DocumentBasis[]): string {
  const schools = [...new Set(documents.filter(isBasicPlan).map((d) => d.university))];
  if (!schools.length) return "";
  if (schools.length > 3) return "현재 안내는 각 대학의 기본계획 기준이며, 최종 모집요강에서 변경될 수 있습니다.";
  return `${schools.join("·")}는 현재 서비스에 확보된 기본계획을 기준으로 안내합니다. 최종 모집요강에서 변경될 수 있습니다.`;
}

export function missingAdmissionEvidence(documents: DocumentBasis[]): string {
  return documents.some(isBasicPlan)
    ? "현재 확보한 기본계획 근거에서는 질문하신 내용을 확인하지 못했습니다. 최종 모집요강이 확보·검증되면 해당 내용을 다시 확인해 안내할 수 있습니다."
    : "현재 확보한 모집요강 근거에서는 질문하신 내용을 확인하지 못했습니다. 대학 입학처의 해당 학년도 안내를 확인해주세요.";
}

// 안내 순서는 최종 모집요강 → 편입학 기본계획 → 없음이다. 없을 때도 '수집된 자료 기준'으로 범위를 한정한다.
export function noAdmissionDocument(scope: string): string {
  return `현재까지 수집된 ${scope} 자료 기준으로는 최종 모집요강도 편입학 기본계획도 아직 공개된 정보가 없어요. 확인되는 대로 안내할게요. 정확한 공개 여부는 입학처 공지도 함께 확인해 주세요.`;
}

export function documentBasisSummary(documents: DocumentBasis[]): string {
  const schools = [...new Set(documents.map((document) => document.university))];
  const basicSchools = schools.filter((school) =>
    documents.filter((document) => document.university === school).every(isBasicPlan)
  );
  const finalSchools = schools.filter((school) => !basicSchools.includes(school));
  if (!finalSchools.length) {
    return "아직 최종 모집요강이 나온 곳은 없어 모두 편입학 기본계획 기준이에요. 최종 모집요강이 나오면 그 기준으로 다시 안내할게요.";
  }
  if (!basicSchools.length) return "모두 최종 모집요강 기준이에요.";
  return `최종 모집요강 기준: ${finalSchools.join("·")} / 편입학 기본계획 기준(변경 가능): ${basicSchools.join("·")}.`;
}

// 여러 학교를 한 번에 물으면 학교별로 최종 요강·기본계획·미확보 상태를 먼저 밝힌다.
export function admissionScopeStatus(params: {
  year: number | null;
  documents: DocumentBasis[];
  missingUniversities: string[];
}): string {
  const schools = [...new Set(params.documents.map((document) => document.university))];
  const basicSchools = schools.filter((school) =>
    params.documents.filter((document) => document.university === school).every(isBasicPlan)
  );
  const finalSchools = schools.filter((school) => !basicSchools.includes(school));
  const yearLabel = params.year ? `${params.year}학년도 ` : "";
  const lines: string[] = [];
  if (!finalSchools.length) lines.push(`물어보신 학교 중 ${yearLabel}최종 모집요강이 나온 곳은 아직 없어요.`);
  if (finalSchools.length) lines.push(`- ${finalSchools.join("·")}: 최종 모집요강 기준으로 안내해요.`);
  if (basicSchools.length) {
    lines.push(`- ${basicSchools.join("·")}: 기본계획이 나와 있어 기본계획 기준으로 확인되는 내용을 안내해요. 최종 모집요강에서 바뀔 수 있어요.`);
  }
  if (params.missingUniversities.length) {
    lines.push(`- ${params.missingUniversities.join("·")}: 현재까지 수집된 ${yearLabel}자료 기준으로는 최종 모집요강도 기본계획도 아직 공개된 정보가 없어요. 입학처 공지도 함께 확인해 주세요.`);
  }
  return lines.join("\n");
}
