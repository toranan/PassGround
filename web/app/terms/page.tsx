import { Navbar } from "@/components/Navbar";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-4">이용약관</h1>
        <p className="text-sm text-muted-foreground">
          이용약관 내용은 추후 작성해 주세요.
        </p>
      </main>
    </div>
  );
}
