export const ENABLE_TRANSFER = true;

// CPA category is disabled for now.
export const ENABLE_CPA = false;

// Writes for CPA (posting, comments, verification, etc.) are kept off for now.
export const ENABLE_CPA_WRITE = false;

// Auth mode flags
export const ENABLE_SOCIAL_AUTH = true;
export const ENABLE_EMAIL_AUTH = false;

// AI 상담 로그인 필수 여부. 서버만 이 값을 보고, 웹·앱은 401을 받으면 로그인 안내를 띄운다.
// 다시 막으려면 Vercel 환경변수 AI_CHAT_LOGIN_REQUIRED=true 로 설정하고 재배포한다.
export const AI_CHAT_LOGIN_REQUIRED = process.env.AI_CHAT_LOGIN_REQUIRED === "true";

// 글·댓글 작성자의 합격자 인증 배지 표시. 인증 기능을 다시 열 때 true로 바꾼다.
export const SHOW_VERIFICATION_BADGES = false;
