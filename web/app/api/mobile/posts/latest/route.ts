import { NextResponse } from "next/server";
import { COMMUNITY_BOARD_GROUPS, TRANSFER_MERGED_BOARD_SLUGS } from "@/lib/data";
import { getSupabaseServer } from "@/lib/supabaseServer";

// 앱 커뮤니티가 주기적으로 묻는 가벼운 확인용 API. 가장 최근 글 id만 돌려주고,
// 앱은 이 값이 바뀌었을 때만 목록을 새로 불러온다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exam = (searchParams.get("exam") ?? "").trim();
  const board = (searchParams.get("board") ?? "").trim();
  const boardInfo = COMMUNITY_BOARD_GROUPS.find((group) => group.examSlug === exam)?.boards.find((item) => item.slug === board);
  if (!boardInfo) {
    return NextResponse.json({ error: "지원하지 않는 게시판입니다." }, { status: 400 });
  }

  const slugs = exam === "transfer" && board === "free" ? TRANSFER_MERGED_BOARD_SLUGS : [board];
  const supabase = getSupabaseServer();
  const { data: boards } = await supabase
    .from("boards")
    .select("id,exams!inner(slug)")
    .eq("exams.slug", exam)
    .in("slug", slugs);
  const boardIds = (boards ?? []).map((item) => item.id as string);
  if (!boardIds.length) return NextResponse.json({ latestId: null, latestAt: null });

  const { data } = await supabase
    .from("posts")
    .select("id,created_at")
    .in("board_id", boardIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; created_at: string | null }>();

  const response = NextResponse.json({ latestId: data?.id ?? null, latestAt: data?.created_at ?? null });
  // 사용자가 많아도 DB 조회는 몇 초에 한 번으로 묶인다.
  response.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=5");
  return response;
}
