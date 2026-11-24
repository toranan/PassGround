import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseManifest, buildTransferKnowledgeUnits, assertNoDocumentDowngrade, isPreliminaryDocument, selectSupersededDocuments } from "./ingest-transfer-manifest.mjs";

test("최종 요강에서 기본계획으로 역행하지 않는다", () => {
  const final = { document_type: "최종 모집요강" };
  assert.throws(() => assertNoDocumentDowngrade("전형 기본계획", [final]), /되돌릴 수 없습니다/);
  assert.doesNotThrow(() => assertNoDocumentDowngrade("최종 모집요강", [final]));
  assert.doesNotThrow(() => assertNoDocumentDowngrade("전형 기본계획", []));
  assert.equal(isPreliminaryDocument(final), false);
  assert.equal(isPreliminaryDocument({ document_type: "전형 기본계획" }), true);
  assert.equal(isPreliminaryDocument({ document_type: "모집 주요사항(안)" }), true);
  assert.equal(isPreliminaryDocument({ document_type: "필기고사 과목·출제범위(안)", metadata: { publicationStage: "written_subject_announcement_draft" } }), true);
});

for (const [slug, count] of [["yonsei", 23], ["incheon", 16], ["gnu", 22]]) {
  test(`${slug}: 원문 출처·미공개 정원·구조화 단위 검증`, async () => {
    const path = new URL(`../../docs/knowledge-extractions/2027-${slug}-transfer-basic-plan.verified.json`, import.meta.url);
    const manifest = parseManifest(await readFile(path, "utf8"), path.pathname);
    assert.equal(manifest.document.admissionYear, 2027);
    assert.equal(manifest.document.metadata.publicationStage, "basic_plan");
    assert.equal(manifest.document.metadata.factAvailability.recruitmentQuota, "deferred");
    assert.equal(manifest.programs.length, 0);
    const units = buildTransferKnowledgeUnits(manifest);
    assert.equal(units.length, count);
    assert.ok(units.every((row) => row.sourcePages.length > 0));
    assert.ok(units.every((row) => !row.content.includes("null")));
    if (slug === "yonsei") {
      assert.deepEqual(manifest.selectionRules.find((row) => row.scopeValue === "간호학과").writtenSubjects, ["사회논술"]);
    }
    if (slug === "incheon") {
      assert.ok(manifest.selectionRules.every((row) => row.writtenSubjects.length === 0));
      assert.match(units.find((row) => row.unitKey === "rule:normal").content, /공인어학 60%/);
    }
    if (slug === "gnu") {
      const vet = manifest.selectionRules.find((row) => row.scopeValue === "수의학과");
      assert.equal(vet.stage1WrittenWeight, null);
      assert.match(vet.notes, /총70점/);
      assert.match(units.find((row) => row.unitKey === "rule:health-0").content, /전공이수능력 15%/);
    }
  });
}

test("필기 과목 미공개 전형을 필기 없음으로 쓰지 않는다", async () => {
  const path = new URL("../../docs/knowledge-extractions/2027-jnu-transfer-basic-plan.verified.json", import.meta.url);
  const manifest = parseManifest(await readFile(path, "utf8"), path.pathname);
  const rule = buildTransferKnowledgeUnits(manifest).find((row) => row.unitKey === "rule:written-veterinary");
  assert.match(rule.content, /필기시험 과목은 미공개\(필기 실시\)이다/);
});

test("부속 문서와 본문 기본계획은 서로 대체하지 않고 최종 요강은 모두 대체한다", () => {
  const main = { id: "main", document_type: "전형 기본계획", metadata: {} };
  const supplement = { id: "sup", document_type: "전공필기고사 시험과목 안내", metadata: { supplementOf: { sha256: "x" } } };
  const ids = (incoming) => selectSupersededDocuments(incoming, [main, supplement]).map((row) => row.id);
  assert.deepEqual(ids({ documentType: "전공필기고사 시험과목 안내", metadata: { supplementOf: { sha256: "x" } } }), ["sup"]);
  assert.deepEqual(ids({ documentType: "전형 기본계획", metadata: {} }), ["main"]);
  assert.deepEqual(ids({ documentType: "최종 모집요강", metadata: {} }), ["main", "sup"]);
});

test("최종 요강: 정원 합계·캠퍼스 표기·필기 없는 전형 문장", async () => {
  const load = async (name) => {
    const path = new URL(`../../docs/knowledge-extractions/${name}`, import.meta.url);
    return parseManifest(await readFile(path, "utf8"), path.pathname);
  };
  const jnu = await load("2027-jnu-transfer-final.verified.json");
  assert.equal(jnu.document.documentType, "최종 모집요강");
  assert.deepEqual([jnu.actual.generalTotal, jnu.actual.bachelorTotal], [647, 83]);
  const jnuUnits = buildTransferKnowledgeUnits(jnu);
  assert.ok(jnuUnits.every((row) => !row.content.includes("전체캠퍼스") && !row.content.includes("null")));
  assert.match(jnuUnits.find((row) => row.unitKey === "program:공학대학:산업기술융합공학과(야간)").content, /여수캠퍼스 공학대학/);
  assert.match(jnuUnits.find((row) => row.unitKey === "rule:single-yeosu-gpa-interview").content, /일괄합산\. 최종 단계는/);

  const unist = await load("2027-unist-general-transfer-final.verified.json");
  assert.equal(unist.actual.generalTotal, 73);
  assert.match(buildTransferKnowledgeUnits(unist).find((row) => row.unitType === "program").content, /^.*\n울산과학기술원 울산캠퍼스 /);

  // 가천대: 일반·학사 외 특별전형 인원도 학과 문장에 들어가야 간호학과를 5명으로만 답하지 않는다.
  const gachon = await load("2027-gachon-transfer-final.verified.json");
  assert.deepEqual([gachon.actual.generalTotal, gachon.actual.bachelorTotal], [442, 81]);
  const gachonUnits = buildTransferKnowledgeUnits(gachon);
  const nursing = gachonUnits.find((row) => row.unitKey === "program:간호대학:간호학과").content;
  assert.match(nursing, /가천대학교 메디컬캠퍼스 간호대학 간호학과/);
  assert.match(nursing, /일반편입 5명, 학사편입 0명/);
  assert.match(nursing, /특별전형 모집인원은 농어촌 1명, 재외국민 및 외국인 1명, 의료인력 및 유치원교사\(전문학사학위 소지자, 4학년\) 25명이다\.$/);
  assert.doesNotMatch(gachonUnits.find((row) => row.unitKey === "program:경영대학:관광경영학과").content, /특별전형|캠퍼스/);
  const special = (major) => gachon.programs.find((row) => row.major === major).metadata.specialQuotas ?? {};
  const totalOf = (label) => gachon.programs.reduce((sum, row) => sum + (row.metadata.specialQuotas?.[label] ?? 0), 0);
  assert.deepEqual(
    ["농어촌", "특성화고교", "재외국민 및 외국인", "의료인력 및 유치원교사(전문학사학위 소지자, 4학년)"].map(totalOf),
    [11, 3, 12, 42]
  );
  assert.deepEqual(special("유아교육학과"), { "의료인력 및 유치원교사(전문학사학위 소지자, 4학년)": 5 });
  // 기본계획 대비 변경: 식품생명공학과는 영어, 우선선발은 50:50
  const ruleScope = (key) => gachon.selectionRules.find((row) => row.key === key).scopeValue.split(", ");
  assert.ok(ruleScope("general-english").includes("식품생명공학과"));
  assert.ok(!ruleScope("general-math").includes("식품생명공학과"));
  assert.match(gachonUnits.find((row) => row.unitKey === "rule:priority-general").content, /서류 50%, 면접 50%/);
  assert.match(gachonUnits.find((row) => row.unitKey === "rule:general-math").content, /필기시험 시간은 60분이고 객관식 25문항이다/);
});
