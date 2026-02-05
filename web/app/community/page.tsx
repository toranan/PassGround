import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { Search } from "lucide-react";

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_60%),linear-gradient(180deg,rgba(15,23,42,0.04),transparent_50%)]">
          <div className="container mx-auto px-4 py-8 md:py-10">
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-10 items-center">
              <div className="w-full">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      placeholder="게시판, 키워드 검색"
                      className="pl-9"
                    />
                  </div>
                  <Button className="h-11 bg-emerald-700 hover:bg-emerald-800">
                    검색
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 space-y-12">
            {COMMUNITY_BOARD_GROUPS.map((group) => (
              <div key={group.id} id={group.examSlug} className="scroll-mt-24">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
                  <div className="space-y-2">
                    <h2 className="font-display text-2xl font-bold">{group.examName}</h2>
                    <p className="text-sm text-muted-foreground">{group.description}</p>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="self-start md:self-auto"
                  >
                    <Link href={`/c/${group.examSlug}/free/write`}>글쓰기</Link>
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.boards.map((board) => (
                    <Card key={board.id} className="border-none shadow-lg hover:shadow-xl transition-shadow">
                      <CardHeader className="space-y-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{board.name}</CardTitle>
                          <span className="text-xs font-semibold text-emerald-600">
                            오늘 {board.postsToday}건
                          </span>
                        </div>
                        <CardDescription className="text-sm">{board.description}</CardDescription>
                        <Button asChild variant="outline" size="sm" className="w-full">
                          <Link href={`/c/${group.examSlug}/${board.slug}`}>
                            게시판 둘러보기
                          </Link>
                        </Button>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
