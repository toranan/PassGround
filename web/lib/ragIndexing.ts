import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildKnowledgeChunks,
  createEmbeddings,
  estimateChunkTokens,
  type RagKnowledgeItem,
} from "@/lib/aiRag";

type Exam = "transfer" | "cpa";

type SyncParams = {
  admin: SupabaseClient;
  exam: Exam;
  item: RagKnowledgeItem;
};

export async function deleteKnowledgeChunksByItem(admin: SupabaseClient, knowledgeItemId: string) {
  const { error } = await admin.from("ai_knowledge_chunks").delete().eq("knowledge_item_id", knowledgeItemId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertKnowledgeChunksForApprovedItem({
  admin,
  exam,
  item,
}: SyncParams): Promise<{ chunkCount: number }> {
  const chunks = buildKnowledgeChunks([item]);
  if (!chunks.length) {
    await deleteKnowledgeChunksByItem(admin, item.id);
    return { chunkCount: 0 };
  }

  const chunkTexts = chunks.map((chunk) => chunk.chunkText);
  const vectors = await createEmbeddings(chunkTexts);
  const upsertRows = chunks.map((chunk, index) => ({
    knowledge_item_id: chunk.knowledgeItemId,
    exam_slug: exam,
    chunk_index: chunk.chunkIndex,
    chunk_text: chunk.chunkText,
    embedding: vectors[index],
    token_estimate: estimateChunkTokens(chunk.chunkText),
  }));

  const { error: upsertError } = await admin.from("ai_knowledge_chunks").upsert(upsertRows, {
    onConflict: "knowledge_item_id,chunk_index",
  });
  if (upsertError) {
    throw new Error(upsertError.message);
  }

  // Remove leftover chunks that are no longer used after edits.
  const { error: trimError } = await admin
    .from("ai_knowledge_chunks")
    .delete()
    .eq("knowledge_item_id", item.id)
    .eq("exam_slug", exam)
    .gte("chunk_index", upsertRows.length);

  if (trimError) {
    throw new Error(trimError.message);
  }

  return { chunkCount: upsertRows.length };
}
