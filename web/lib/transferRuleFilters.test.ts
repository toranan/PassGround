import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildTransferKnowledgeUnits, parseManifest } from "../scripts/ingest-transfer-manifest.mjs";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { englishTestMatches, ruleEnglishTest, trackMatches } from "./transferRuleFilters.ts";

type Unit = { unitType: string; university: string; metadata: Record<string, unknown>; category: string | null };

async function loadRules(): Promise<Unit[]> {
  const dir = new URL("../../docs/knowledge-extractions/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => /^2027-.*\.verified\.json$/.test(name));
  const units: Omit<Unit, "category">[] = [];
  for (const name of files) {
    const path = new URL(name, dir);
    units.push(...buildTransferKnowledgeUnits(parseManifest(await readFile(path, "utf8"), path.pathname)));
  }
  return units.filter((unit) => unit.unitType === "selection_rule").map((unit) => ({ ...unit, category: null }));
}

test("토익 보는 자연계 전형은 공인영어 반영·자격 규칙만 고르고 미공개는 따로 둔다", async () => {
  const rules = await loadRules();
  const matched = rules.filter((row) => trackMatches(row, "natural") && englishTestMatches(row, "any", true));
  const confirmed = matched.filter((row) => ruleEnglishTest(row)?.role !== "undisclosed");
  const keys = confirmed.map((row) => `${row.university}:${row.metadata.ruleKey}`).sort();
  assert.deepEqual(keys, [
    "강원대학교:eco-landscape-design",
    "강원대학교:general-bachelor-default",
    "강원대학교:nursing-general",
    "강원대학교:pharmacy",
    "강원대학교:veterinary",
    "경북대학교:general-majors",
    "경북대학교:veterinary",
    "경상국립대학교:health-0",
    "경상국립대학교:health-1",
    "경상국립대학교:nointerview",
    "경상국립대학교:normal",
    "경상국립대학교:nursing",
    "경상국립대학교:software",
    "경희대학교:electronics-document-english-prior",
    "부산대학교:document20-interview20-colleges",
    "부산대학교:interview40-colleges",
    "상명대학교:english-score-only",
    "서울과학기술대학교:architecture",
    "서울과학기술대학교:engineering-math-6x",
    "서울과학기술대학교:lifelong-worker",
    "서울과학기술대학교:math-4x",
    "서울과학기술대학교:same-field-math-6x",
    "서울시립대학교:architecture",
    "서울시립대학교:humanities-landscape-sports",
    "서울시립대학교:natural-1-math",
    "서울시립대학교:natural-2-english-math",
    "연세대학교:ai-0",
    "연세대학교:ai-1",
    "연세대학교:ai-2",
    "연세대학교:ai-3",
    "연세대학교:ee",
    "연세대학교:medicine",
    "연세대학교:nursing",
    "연세대학교:pharmacy",
    "인천대학교:normal",
    "중앙대학교:document-language-gpa",
    "충남대학교:computer-ai",
    "충남대학교:food-science",
    "충남대학교:general-interview",
    "충남대학교:math-education",
    "충남대학교:pharmacy",
    "충남대학교:veterinary",
    "충북대학교:general-interview",
    "충북대학교:nursing",
    "충북대학교:practical",
    "한양대학교:general-bachelor-all-categories",
    "한양대학교:general-pharmacy",
    "한양대학교:outside-quota",
  ]);
  const undisclosed = new Set(matched.filter((row) => ruleEnglishTest(row)?.role === "undisclosed").map((row) => row.university));
  assert.ok(undisclosed.has("전남대학교") && undisclosed.has("숭실대학교"));
  assert.ok(!keys.some((key) => /충북대학교:(veterinary|pharmacy)/.test(key)), "TOEIC 불인정 전형 제외");
  assert.ok(!keys.some((key) => key.startsWith("숙명여자대학교") || key.startsWith("울산과학기술원")));
});
