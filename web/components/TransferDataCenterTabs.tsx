"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransferCutoffAnalyzerPanel } from "@/components/TransferCutoffAnalyzerPanel";
import { TransferInstructorRankingPanel } from "@/components/TransferInstructorRankingPanel";

type TransferDataCenterTabsProps = {
  defaultTab?: "cutoff" | "ranking";
};

export function TransferDataCenterTabs({ defaultTab = "cutoff" }: TransferDataCenterTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="cutoff">커트라인 분석</TabsTrigger>
        <TabsTrigger value="ranking">강사 랭킹</TabsTrigger>
      </TabsList>

      <TabsContent value="cutoff" className="border-none p-0 mt-4">
        <TransferCutoffAnalyzerPanel />
      </TabsContent>

      <TabsContent value="ranking" className="border-none p-0 mt-4">
        <TransferInstructorRankingPanel />
      </TabsContent>
    </Tabs>
  );
}
