import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
// @ts-expect-error Node의 직접 실행 테스트에서만 .ts 확장자를 사용한다.
import { isMockExamCounselingQuestion } from "./mockExamCoaching.ts";
// @ts-expect-error Node의 직접 실행 테스트에서만 .ts 확장자를 사용한다.
import { isCutoffEvidenceKnowledgeItem } from "./cutoffEvidence.ts";

test("오타가 섞인 모고 합격 상담과 모의고사 컷 질문은 상담으로 분류", () => {
  for (const question of [
    "나 ㅁ영 편입모고 백분위 87.5고 원점ㅅ 78점인데 한양대 간호학과 갈수있을꺼?",
    "한양대 모의고사 컷트라인 알려줘",
    "김영 모의고사 망했어 포기해야 해?",
    "모의고사 78점이면 본고사 합격 가능해?",
  ]) assert.equal(isMockExamCounselingQuestion(question), true, question);
});

test("본고사 컷·모집요강·모고 일정 질문은 성적 상담으로 가로채지 않음", () => {
  const history = [{ role: "user" as const, text: "김영 모고 78점이야" }];
  for (const question of [
    "한양대 본고사 78점 합격 가능해?",
    "한양대 간호학과 모집인원 알려줘",
    "모고랑 별개로 지원 자격 알려줘",
    "김영 모의고사 언제야?",
    "고마워",
  ]) assert.equal(isMockExamCounselingQuestion(question, history), false, question);
  assert.equal(isMockExamCounselingQuestion("한양대 78점 합격 가능해?"), false);
});

test("바로 앞 모고 질문의 점수·학과 보충은 상담을 유지", () => {
  const history = [{ role: "user" as const, text: "김영 모고 성적 상담해줘" }];
  assert.equal(isMockExamCounselingQuestion("백분위 87.5 원점수 78이야", history), true);
  assert.equal(isMockExamCounselingQuestion("그럼 간호학과는?", history), true);
});

test("합격자 평균·점수·컷이라는 단어가 있어도 참고자료는 컷 근거에서 제외", () => {
  const item = { id: "test", question: "합격자 모의고사 평균", answer: "최초합 수학 72점, 커트라인으로 사용하지 않음", raw_input: "", tags: ["reference-only", "mock-exam-average"] };
  assert.equal(isCutoffEvidenceKnowledgeItem(item), false);
  assert.equal(isCutoffEvidenceKnowledgeItem({ ...item, tags: ["합격제보"], question: "본고사 점수제보", answer: "본고사 72점 최초합" }), true);
});

test("18개 원문 그룹과 서로 다른 백분율을 그대로 보존", async () => {
  const document = JSON.parse(await readFile(new URL("../../docs/knowledge-extractions/nowon-kimyoung-mock-averages.reference.json", import.meta.url), "utf8")) as {
    admission_year: number | null;
    usage: string;
    groups: Array<{ key: string; majors: string[]; english: { raw: number; percentage: number } }>;
  };
  assert.equal(document.groups.length, 18);
  assert.equal(document.admission_year, null);
  assert.equal(document.usage, "reference-only");
  const groups = new Map(document.groups.map((group) => [group.key, group]));
  assert.deepEqual(groups.get("sogang-humanities-1")?.english, { raw: 82.5, percentage: 95.6 });
  assert.deepEqual(groups.get("hanyang-humanities-1")?.english, { raw: 82.5, percentage: 94.2 });
  assert.equal(document.groups.some((group: { majors: string[] }) => group.majors.includes("간호")), false);
  assert.equal(JSON.stringify(document).includes("러프"), false);
});
