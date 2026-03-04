import { Navbar } from "@/components/Navbar";
import { redirect } from "next/navigation";
import { TransferAiAssistantPanel } from "@/components/TransferAiAssistantPanel";

type TransferAiPageProps = {
  searchParams: Promise<{
    tab?: string;
  }>;
};

export default async function TransferAiPage({ searchParams }: TransferAiPageProps) {
  const params = await searchParams;
  if (params?.tab === "cutoff") {
    redirect("/transfer/data-center?tab=cutoff");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="py-4 md:py-6">
          <div className="container mx-auto px-4 max-w-6xl">
            <TransferAiAssistantPanel />
          </div>
        </section>
      </main>
    </div>
  );
}
