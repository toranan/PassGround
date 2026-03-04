import { Navbar } from "@/components/Navbar";
import { TransferAiHubTabs } from "@/components/TransferAiHubTabs";

type TransferAiPageProps = {
  searchParams: Promise<{
    tab?: string;
  }>;
};

export default async function TransferAiPage({ searchParams }: TransferAiPageProps) {
  const params = await searchParams;
  const tab = params?.tab === "cutoff" ? "cutoff" : "assistant";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.12),transparent_58%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl font-bold">AI 도우미 탭</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              합곰 AI 도우미와 AI 커트라인 분석을 한 탭에서 바로 전환해서 사용할 수 있어.
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 max-w-5xl">
            <TransferAiHubTabs defaultTab={tab} />
          </div>
        </section>
      </main>
    </div>
  );
}
