type DocumentBasis = {
  university: string;
  document_type: string;
  metadata?: Record<string, unknown> | null;
};

export function isBasicPlan(document: DocumentBasis): boolean {
  return document.metadata?.publicationStage === "basic_plan"
    || /기본계획|주요사항|예고사항/.test(document.document_type);
}

export function basicPlanNotice(documents: DocumentBasis[]): string {
  const schools = [...new Set(documents.filter(isBasicPlan).map((d) => d.university))];
  return schools.length
    ? `${schools.join("·")}는 현재 서비스에 확보된 기본계획을 기준으로 안내합니다. 최종 모집요강에서 변경될 수 있습니다.`
    : "";
}

export function missingAdmissionEvidence(documents: DocumentBasis[]): string {
  return documents.some(isBasicPlan)
    ? "현재 확보한 기본계획 근거에서는 질문하신 내용을 확인하지 못했습니다. 최종 모집요강이 확보·검증되면 해당 내용을 다시 확인해 안내할 수 있습니다."
    : "현재 확보한 모집요강 근거에서는 질문하신 내용을 확인하지 못했습니다. 대학 입학처의 해당 학년도 안내를 확인해주세요.";
}

export function noAdmissionDocument(scope: string): string {
  return `${scope}의 기본계획과 최종 모집요강이 아직 서비스에 확보·검증되지 않았습니다. 모집요강이 확보·검증되면 관련 정보를 안내할 수 있습니다. 대학의 실제 공개 여부는 입학처에서 확인해주세요.`;
}
