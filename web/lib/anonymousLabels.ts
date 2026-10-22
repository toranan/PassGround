// 익명 댓글을 글마다 "익명1, 익명2 …"로 나누고, 글 작성자가 익명으로 단 댓글은 "글쓴이"로 표시한다.
// 같은 사람은 그 글 안에서 늘 같은 번호를 받는다(처음 댓글을 단 순서). 댓글은 작성 시간 오름차순으로 넘겨야 한다.
export const POST_AUTHOR_LABEL = "글쓴이";

type CommentAuthor = {
  id: string;
  author_name: string | null;
  author_id: string | null;
};

export function isAnonymousName(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim();
  return !trimmed || trimmed === "익명";
}

export function anonymousCommentLabels(comments: CommentAuthor[], postAuthorId: string | null): Map<string, string> {
  const labels = new Map<string, string>();
  const numberByAuthor = new Map<string, number>();
  for (const comment of comments) {
    if (!isAnonymousName(comment.author_name)) continue;
    const authorId = (comment.author_id ?? "").trim();
    if (authorId && postAuthorId && authorId === postAuthorId) {
      labels.set(comment.id, POST_AUTHOR_LABEL);
      continue;
    }
    // 작성자를 알 수 없는 옛 댓글은 댓글마다 다른 사람으로 본다.
    const key = authorId || `comment:${comment.id}`;
    if (!numberByAuthor.has(key)) numberByAuthor.set(key, numberByAuthor.size + 1);
    labels.set(comment.id, `익명${numberByAuthor.get(key)}`);
  }
  return labels;
}
