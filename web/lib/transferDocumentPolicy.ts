type DocumentBasis = {
  university: string;
  document_type: string;
  metadata?: Record<string, unknown> | null;
};

export function normalizeTransferUniversityName(value: string): string {
  const normalized = value.toLowerCase().replace(/\s+/g, "").replace(/대학교$/, "대");
  return ({ 연대: "연세대", 성대: "성균관대", 경상대: "경상국립대" } as Record<string, string>)[normalized]
    ?? normalized;
}

export function isBasicPlan(document: DocumentBasis): boolean {
  return document.metadata?.publicationStage === "basic_plan"
    || /기본계획|주요사항|예고사항/.test(document.document_type);
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

export function noAdmissionDocument(scope: string): string {
  return `${scope}의 기본계획과 최종 모집요강이 아직 서비스에 확보·검증되지 않았습니다. 모집요강이 확보·검증되면 관련 정보를 안내할 수 있습니다. 대학의 실제 공개 여부는 입학처에서 확인해주세요.`;
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
  if (!finalSchools.length) lines.push(`물어보신 학교 중 ${yearLabel}최종 모집요강이 확보된 곳은 아직 없어요.`);
  if (finalSchools.length) lines.push(`- ${finalSchools.join("·")}: 최종 모집요강 기준으로 안내해요.`);
  if (basicSchools.length) {
    lines.push(`- ${basicSchools.join("·")}: 기본계획이 나와 있어 기본계획 기준으로 확인되는 내용을 안내해요. 최종 모집요강에서 바뀔 수 있어요.`);
  }
  if (params.missingUniversities.length) {
    lines.push(`- ${params.missingUniversities.join("·")}: 기본계획과 최종 모집요강 모두 아직 서비스에 확보·검증되지 않았어요. 입학처 공지를 확인해 주세요.`);
  }
  return lines.join("\n");
}
