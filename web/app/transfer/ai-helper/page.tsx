import { Navbar } from "@/components/Navbar";
import { TransferAiAssistantPanel } from "@/components/TransferAiAssistantPanel";

export default function TransferAiHelperPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.12),transparent_58%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl font-bold">AI 도우미</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              합곰이 편입 정보와 검수된 조언을 기준으로 답해줘. 없는 정보는 모른다고 정확히 안내해.
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 max-w-4xl">
            <TransferAiAssistantPanel />
          </div>
        </section>
      </main>
    </div>
  );
}
