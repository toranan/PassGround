import { Navbar } from "@/components/Navbar";
import { TransferDataCenterTabs } from "@/components/TransferDataCenterTabs";

export default function TransferDataCenterPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.12),transparent_58%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl font-bold">커트라인 분석</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              학교/학과별 합격 커트라인을 확인해 보세요.
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 max-w-5xl">
            <TransferDataCenterTabs />
          </div>
        </section>
      </main>
    </div>
  );
}
