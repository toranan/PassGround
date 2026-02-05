import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { BoardComposer } from "@/components/BoardComposer";
import { COMMUNITY_BOARD_GROUPS } from "@/lib/data";

type BoardWritePageProps = {
  params: Promise<{
    exam: string;
    board: string;
  }>;
};

export default async function BoardWritePage({ params }: BoardWritePageProps) {
  const { exam, board } = await params;
  const examInfo = COMMUNITY_BOARD_GROUPS.find((group) => group.examSlug === exam);
  const examName = examInfo?.examName ?? exam;
  const boardName =
    examInfo?.boards.find((board) => board.slug === board)?.name ?? "게시판";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-muted/30">
          <div className="container mx-auto px-4 py-6">
            <div className="text-sm text-muted-foreground">
              <Link href="/community" className="hover:text-foreground">
                커뮤니티
              </Link>
              <span className="mx-2">/</span>
              <Link href={`/c/${exam}/${board}`} className="hover:text-foreground">
                {examName} {boardName}
              </Link>
              <span className="mx-2">/</span>
              <span>글쓰기</span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold mt-2">
              글쓰기
            </h1>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4">
            <BoardComposer examSlug={exam} boardSlug={board} />
          </div>
        </section>
      </main>
    </div>
  );
}
