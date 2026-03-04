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
        <section className="py-6 md:py-8">
          <div className="container mx-auto px-4 max-w-6xl">
            <TransferAiHubTabs defaultTab={tab} />
          </div>
        </section>
      </main>
    </div>
  );
}
