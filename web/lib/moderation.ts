// 커뮤니티 안전장치: 금칙어 필터, 이용정지 확인, 차단 목록, 신고 누적 숨김.
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// 띄어쓰기·특수문자·숫자를 끼워 넣어도 걸리도록 비교 전에 모두 지운다.
const BANNED_WORDS = [
  "씨발", "씨빨", "씨바", "시발", "시바알", "씨팔", "시팔", "ㅅㅂ", "ㅆㅂ", "ㅆ발", "ㅅ발",
  "병신", "븅신", "빙신", "ㅂㅅ", "좆", "좇같", "존나게", "개새끼", "개색기", "개새기", "개쉐이", "ㄱㅅㄲ",
  "지랄", "ㅈㄹ", "미친놈", "미친년", "미친새끼", "엠창", "느금마", "느금", "니애미", "니어미", "니미럴",
  "애미뒤진", "애비뒤진", "후장", "섹스", "걸레년", "창녀", "한남충", "김치녀", "틀딱",
];

// 금칙어를 포함하지만 정상적인 단어
const ALLOWED_PHRASES = ["시발점", "시바견"];

function normalizeForFilter(text: string): string {
  let normalized = text.toLowerCase();
  for (const phrase of ALLOWED_PHRASES) normalized = normalized.split(phrase).join("");
  return normalized.replace(/[\s0-9!-/:-@[-`{-~·•ㆍ_]/g, "");
}

export function findBannedWord(...texts: string[]): string | null {
  const normalized = normalizeForFilter(texts.join(" "));
  return BANNED_WORDS.find((word) => normalized.includes(word)) ?? null;
}

export const BANNED_WORD_MESSAGE = "욕설이나 비방 표현이 포함되어 있어 등록할 수 없어요. 내용을 수정해 주세요.";
export const BANNED_USER_MESSAGE = "운영정책 위반으로 이용이 정지된 계정이에요. 문의: seungwon6218@naver.com";

export async function isUserBanned(userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("profiles")
    .select("banned_at")
    .eq("id", userId)
    .maybeSingle<{ banned_at: string | null }>();
  return Boolean(data?.banned_at);
}

// 내가 차단한 사용자 id 목록(로그인하지 않았으면 빈 목록)
export async function loadBlockedUserIds(viewerId: string | null | undefined): Promise<string[]> {
  if (!viewerId || !/^[0-9a-f-]{36}$/i.test(viewerId)) return [];
  const { data } = await getSupabaseAdmin().from("user_blocks").select("blocked_id").eq("blocker_id", viewerId);
  return ((data ?? []) as { blocked_id: string }[]).map((row) => row.blocked_id);
}

// 서로 다른 사람이 이만큼 신고하면 관리자 확인 전이라도 바로 숨긴다.
export const AUTO_HIDE_REPORT_COUNT = 3;

export const REPORT_REASONS = ["욕설·비방", "음란·선정성", "광고·도배", "개인정보 노출", "기타"] as const;
