import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "이용약관 - 합격판",
  description: "합격판 서비스 이용약관과 커뮤니티 운영정책",
};

const supportEmail = "seungwon6218@naver.com";

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: "제1조 (목적)",
    body: [
      "이 약관은 합격판(이하 \"서비스\")이 제공하는 편입 정보, AI 상담, 커뮤니티 등 모든 서비스의 이용 조건과 절차, 이용자와 운영자의 권리·의무를 정합니다.",
    ],
  },
  {
    title: "제2조 (약관 동의)",
    body: [
      "이용자는 커뮤니티에 글이나 댓글을 쓰기 전에 이 약관에 동의해야 하며, 동의하지 않으면 커뮤니티를 이용할 수 없습니다.",
      "이 약관은 서비스 화면에 게시하며, 변경 시 시행 7일 전에 공지합니다.",
    ],
  },
  {
    title: "제3조 (부적절한 콘텐츠와 악성 이용자에 대한 무관용 원칙)",
    body: [
      "합격판은 부적절한 콘텐츠와 악성 이용자를 절대 용납하지 않습니다(무관용 원칙). 익명으로 작성한 글과 댓글도 똑같이 적용됩니다.",
      "다음 내용은 금지됩니다: 욕설·비하·혐오 표현, 특정인에 대한 비방·괴롭힘·협박, 음란하거나 선정적인 내용, 폭력적이거나 불법적인 내용, 타인의 개인정보 노출, 광고·홍보·도배, 허위 사실 유포, 저작권 등 타인의 권리를 침해하는 내용.",
      "금지된 표현이 포함된 글과 댓글은 등록이 자동으로 차단될 수 있습니다.",
    ],
  },
  {
    title: "제4조 (신고·차단과 운영자의 조치)",
    body: [
      "이용자는 게시글과 댓글의 메뉴(⋮)에서 부적절한 내용을 신고하거나 작성자를 차단할 수 있습니다. 신고하거나 차단한 내용은 즉시 해당 이용자의 화면에서 사라집니다.",
      "운영자는 신고를 접수한 뒤 24시간 이내에 검토하여, 위반이 확인되면 해당 콘텐츠를 삭제하고 작성자의 서비스 이용을 정지합니다.",
      "여러 이용자의 신고가 누적된 콘텐츠는 운영자 검토 전이라도 자동으로 숨겨질 수 있습니다.",
      "이용이 정지된 계정은 글과 댓글을 작성할 수 없습니다.",
    ],
  },
  {
    title: "제5조 (게시물의 책임)",
    body: [
      "게시물에 대한 책임은 작성한 이용자에게 있습니다. 서비스가 제공하는 편입 정보와 AI 답변은 참고용이며, 최종 확인은 각 대학의 공식 모집요강을 기준으로 해야 합니다.",
    ],
  },
  {
    title: "제6조 (이용 연령)",
    body: ["커뮤니티를 포함한 서비스는 만 18세 이상 이용을 기준으로 합니다."],
  },
  {
    title: "제7조 (문의와 신고 창구)",
    body: [
      `서비스 이용 문의, 부적절한 콘텐츠나 이용자 신고는 ${supportEmail} 로 보내 주세요. 앱에서는 마이 → 문의·신고하기에서도 보낼 수 있습니다.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">이용약관</h1>
        <p className="text-sm text-muted-foreground mb-8">시행일: 2026년 10월 20일</p>
        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-semibold mb-2">{section.title}</h2>
              <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
