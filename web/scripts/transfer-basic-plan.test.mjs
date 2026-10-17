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
