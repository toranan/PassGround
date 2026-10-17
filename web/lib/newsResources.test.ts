import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { buildNewsContent, parseNewsContent } from "./newsResources.ts";

const link = "https://ipsi.cnu.ac.kr/_prog/_board/?mode=V&no=2027413&code=notice_faculty";
const oldFile = "https://x.supabase.co/storage/v1/object/public/attachments/posts/1-old.pdf";
const newFile = "https://x.supabase.co/storage/v1/object/public/attachments/posts/2-new.pdf";

test("이모지가 붙은 링크·첨부 줄을 본문이 아닌 자원으로 인식한다", () => {
  const parsed = parseNewsContent(`■ 전형방법\n\n🔗 [관련 링크](${link})\n📎 [2027충남대기본계획.pdf](${oldFile})`);
  assert.equal(parsed.body, "■ 전형방법");
  assert.equal(parsed.linkUrl, link);
  assert.deepEqual(parsed.attachments.map((file: { url: string }) => file.url), [oldFile]);
});

test("뉴스를 수정 저장해도 링크·첨부 블록이 다시 붙지 않는다", () => {
  const saved = buildNewsContent({ body: "■ 전형방법", linkUrl: link, attachments: [{ url: oldFile, filename: "a.pdf" }] });
  const loaded = parseNewsContent(saved);
  const resaved = buildNewsContent({ body: loaded.body, linkUrl: loaded.linkUrl, attachments: [{ url: newFile, filename: "b.pdf" }] });
  assert.equal(resaved.match(/🔗/gu)?.length, 1);
  assert.deepEqual(parseNewsContent(resaved).attachments.map((file: { url: string }) => file.url), [newFile]);
});
