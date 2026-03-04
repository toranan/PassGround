import { Navbar } from "@/components/Navbar";
import { TransferCutoffAnalyzerPanel } from "@/components/TransferCutoffAnalyzerPanel";

export default function TransferCutoffAnalysisPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.12),transparent_58%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl font-bold">AI 커트라인 분석</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              학년도, 학교, 학과, 점수를 입력하면 RAG 근거 기반으로 합격권/추합권/불합격권을 안내해.
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 max-w-5xl">
            <TransferCutoffAnalyzerPanel />
          </div>
        </section>
      </main>
    </div>
  );
}
