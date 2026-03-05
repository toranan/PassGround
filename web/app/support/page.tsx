import { Navbar } from "@/components/Navbar";

const supportEmail = "seungwon6218@naver.com";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">고객지원</h1>
        <p className="text-sm text-muted-foreground mb-8">
          합격판 서비스 이용 중 문의/오류 신고/계정 관련 요청은 아래 채널로 접수해 주세요.
        </p>

        <section className="rounded-xl border bg-card p-5 mb-6">
          <h2 className="text-lg font-semibold mb-3">문의 접수</h2>
          <p className="text-sm mb-2">
            이메일:{" "}
            <a href={`mailto:${supportEmail}`} className="text-primary underline underline-offset-2">
              {supportEmail}
            </a>
          </p>
          <p className="text-sm text-muted-foreground">
            접수 후 영업일 기준 1~2일 내 답변을 드립니다.
          </p>
        </section>

        <section className="rounded-xl border bg-card p-5 mb-6">
          <h2 className="text-lg font-semibold mb-3">계정 삭제(회원탈퇴) 안내</h2>
          <p className="text-sm text-muted-foreground">
            iOS 앱에서 <span className="font-medium text-foreground">마이페이지 → 내 정보 관리 → 회원탈퇴</span>{" "}
            경로로 직접 계정 삭제를 진행할 수 있습니다.
          </p>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold mb-3">운영 정책</h2>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>서비스명: 합격판 - 편입 전략 커뮤니티</p>
            <p>운영자: Pass Ground</p>
          </div>
        </section>
      </main>
    </div>
  );
}
