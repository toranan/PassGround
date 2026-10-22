import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit extension.
import { anonymousCommentLabels } from "./anonymousLabels.ts";

test("익명 댓글은 사람마다 번호를 받고, 글 작성자는 글쓴이로 표시한다", () => {
  const labels = anonymousCommentLabels(
    [
      { id: "c1", author_name: "익명", author_id: "u1" },
      { id: "c2", author_name: "익명", author_id: "writer" },
      { id: "c3", author_name: "익명", author_id: "u2" },
      { id: "c4", author_name: "익명", author_id: "u1" },
      { id: "c5", author_name: "철수", author_id: "u3" },
      { id: "c6", author_name: "익명", author_id: null },
    ],
    "writer"
  );
  assert.equal(labels.get("c1"), "익명1");
  assert.equal(labels.get("c2"), "글쓴이");
  assert.equal(labels.get("c3"), "익명2");
  assert.equal(labels.get("c4"), "익명1");
  assert.equal(labels.has("c5"), false);
  assert.equal(labels.get("c6"), "익명3");
});
