import { Navbar } from "@/components/Navbar";
import { TransferDataCenterTabs } from "@/components/TransferDataCenterTabs";

type TransferDataCenterPageProps = {
  searchParams: Promise<{
    tab?: string;
  }>;
};

export default async function TransferDataCenterPage({ searchParams }: TransferDataCenterPageProps) {
  const params = await searchParams;
  const tab = params?.tab === "ranking" ? "ranking" : "cutoff";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.12),transparent_58%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl font-bold">데이터센터</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              커트라인 분석과 편입 강사 랭킹을 한 곳에서 확인하세요.
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 max-w-5xl">
            <TransferDataCenterTabs defaultTab={tab} />
          </div>
        </section>
      </main>
    </div>
  );
}
