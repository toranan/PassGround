"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransferAiAssistantPanel } from "@/components/TransferAiAssistantPanel";
import { TransferCutoffAnalyzerPanel } from "@/components/TransferCutoffAnalyzerPanel";

type TransferAiHubTabsProps = {
  defaultTab?: "assistant" | "cutoff";
};

export function TransferAiHubTabs({ defaultTab = "assistant" }: TransferAiHubTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="assistant">합곰 AI 도우미</TabsTrigger>
        <TabsTrigger value="cutoff">AI 커트라인 분석</TabsTrigger>
      </TabsList>

      <TabsContent value="assistant" className="border-none p-0 mt-4">
        <TransferAiAssistantPanel />
      </TabsContent>

      <TabsContent value="cutoff" className="border-none p-0 mt-4">
        <TransferCutoffAnalyzerPanel />
      </TabsContent>
    </Tabs>
  );
}
