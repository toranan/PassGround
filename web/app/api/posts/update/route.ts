import { NextResponse } from "next/server";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function resolveProfileIdByDisplayName(
  admin: ReturnType<typeof getSupabaseAdmin>,
  displayName: string
): Promise<string | null> {
  const normalized = displayName.trim();
  if (!normalized || normalized === "익명") return null;

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("display_name", normalized)
    .limit(2);

  if (!data || data.length !== 1) return null;
  const candidate = data[0] as { id?: string };
  return typeof candidate.id === "string" ? candidate.id : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const requestUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const bodyAccessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";

  if (!postId || !isValidUUID(postId)) {
    return NextResponse.json({ error: "수정할 게시글 id가 필요합니다." }, { status: 400 });
  }
  if (!requestUserId || !isValidUUID(requestUserId)) {
    return NextResponse.json({ error: "유효한 사용자 정보가 필요합니다." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }

  const accessToken = getBearerToken(request) || bodyAccessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const authed = await getUserByAccessToken(accessToken);
  if (!authed?.id) {
    return NextResponse.json({ error: "인증이 만료되었습니다. 다시 로그인해 주세요." }, { status: 401 });
  }
  if (authed.id !== requestUserId) {
    return NextResponse.json({ error: "본인 계정만 사용할 수 있습니다." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const allowAdmin = await isAdminUser(authed.id, authed.email);

  const { data: postRow, error: postError } = await admin
    .from("posts")
    .select("id,author_id,author_name,board_id")
    .eq("id", postId)
    .maybeSingle<{
      id: string;
      author_id: string | null;
      author_name: string | null;
      board_id: string | null;
    }>();

  if (postError || !postRow?.id || !postRow.board_id) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }

  let isOwner = postRow.author_id === authed.id;
  if (!isOwner && !postRow.author_id && postRow.author_name) {
    const resolvedAuthorID = await resolveProfileIdByDisplayName(admin, postRow.author_name);
    isOwner = resolvedAuthorID === authed.id;
  }
  if (!isOwner && !allowAdmin) {
    return NextResponse.json({ error: "본인 글만 수정할 수 있습니다." }, { status: 403 });
  }

  const { data: boardRow } = await admin
    .from("boards")
    .select("exams!inner(slug)")
    .eq("id", postRow.board_id)
    .maybeSingle<{ exams: { slug: string } | { slug: string }[] | null }>();

  const examInfo = boardRow?.exams;
  const examSlug = Array.isArray(examInfo) ? examInfo[0]?.slug : examInfo?.slug;
  if (examSlug === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "현재 CPA 서비스는 비활성화 상태입니다." }, { status: 403 });
  }
  if (examSlug === "cpa" && !ENABLE_CPA_WRITE && !allowAdmin) {
    return NextResponse.json({ error: "현재 CPA는 읽기 전용입니다." }, { status: 403 });
  }

  const { error: updateError } = await admin
    .from("posts")
    .update({
      title,
      content,
    })
    .eq("id", postId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

