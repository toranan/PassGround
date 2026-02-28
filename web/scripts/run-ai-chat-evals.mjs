#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function toLower(text) {
  return String(text || "").toLowerCase();
}

function evaluateCase(caseItem, payload, statusCode, latencyMs) {
  const checks = caseItem.checks || {};
  const errors = [];

  if (statusCode !== 200 || !payload?.ok) {
    errors.push(`HTTP ${statusCode} or payload.ok=false`);
    return { pass: false, errors };
  }

  const answer = String(payload.answer || "");
  const route = String(payload.route || "");
  const contexts = Array.isArray(payload.contexts) ? payload.contexts : [];

  if (typeof checks.minAnswerChars === "number" && answer.length < checks.minAnswerChars) {
    errors.push(`answer too short (${answer.length} < ${checks.minAnswerChars})`);
  }

  if (Array.isArray(checks.routeOneOf) && checks.routeOneOf.length > 0) {
    if (!checks.routeOneOf.includes(route)) {
      errors.push(`route '${route}' not in [${checks.routeOneOf.join(", ")}]`);
    }
  }

  if (typeof checks.minContexts === "number" && contexts.length < checks.minContexts) {
    errors.push(`contexts too few (${contexts.length} < ${checks.minContexts})`);
  }

  if (Array.isArray(checks.requireAnyKeywords) && checks.requireAnyKeywords.length > 0) {
    const answerLower = toLower(answer);
    const matched = checks.requireAnyKeywords.some((keyword) => answerLower.includes(toLower(keyword)));
    if (!matched) {
      errors.push(`none of required keywords found: ${checks.requireAnyKeywords.join(", ")}`);
    }
  }

  if (typeof checks.maxLatencyMs === "number" && latencyMs > checks.maxLatencyMs) {
    errors.push(`latency too high (${latencyMs}ms > ${checks.maxLatencyMs}ms)`);
  }

  return { pass: errors.length === 0, errors };
}

async function main() {
  const baseUrl = (process.env.AI_EVAL_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const exam = process.env.AI_EVAL_EXAM || "transfer";
  const casesPath =
    process.env.AI_EVAL_CASES || path.join(process.cwd(), "evals", `ai-chat-cases.${exam}.json`);
  const minPassRate = Number(process.env.AI_EVAL_MIN_PASS_RATE || "0.8");
  const disableCache = process.env.AI_EVAL_DISABLE_CACHE === "1";
  const evalAccessToken = String(process.env.AI_EVAL_ACCESS_TOKEN || "").trim();

  const raw = await readFile(casesPath, "utf8");
  const cases = JSON.parse(raw);

  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("No eval cases found.");
  }

  let passCount = 0;
  const rows = [];

  for (const caseItem of cases) {
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(evalAccessToken ? { Authorization: `Bearer ${evalAccessToken}` } : {}),
      },
      body: JSON.stringify({
        exam,
        question: String(caseItem.question || ""),
        disableCache,
      }),
    });
    const latencyMs = Date.now() - startedAt;

    const payload = await response.json().catch(() => ({}));
    const result = evaluateCase(caseItem, payload, response.status, latencyMs);
    if (result.pass) passCount += 1;

    rows.push({
      id: caseItem.id || "(no-id)",
      pass: result.pass,
      status: response.status,
      route: payload?.route || "",
      cache: payload?.cache || "",
      latencyMs,
      errors: result.errors,
    });
  }

  const passRate = passCount / cases.length;
  const avgLatencyMs = Math.round(rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length);

  console.log("AI Chat Eval Result");
  console.log(`- baseUrl: ${baseUrl}`);
  console.log(`- exam: ${exam}`);
  console.log(`- cases: ${cases.length}`);
  console.log(`- pass: ${passCount}`);
  console.log(`- passRate: ${(passRate * 100).toFixed(1)}%`);
  console.log(`- avgLatencyMs: ${avgLatencyMs}`);
  console.log("");

  for (const row of rows) {
    const status = row.pass ? "PASS" : "FAIL";
    console.log(`[${status}] ${row.id} status=${row.status} route=${row.route} cache=${row.cache} latency=${row.latencyMs}ms`);
    if (!row.pass) {
      for (const err of row.errors) {
        console.log(`  - ${err}`);
      }
    }
  }

  if (passRate < minPassRate) {
    console.error(`\\nEval failed: passRate ${(passRate * 100).toFixed(1)}% < min ${(minPassRate * 100).toFixed(1)}%`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Eval runner failed:", error?.message || error);
  process.exit(1);
});
