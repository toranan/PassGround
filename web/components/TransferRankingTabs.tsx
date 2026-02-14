"use client";

import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RankingRow = {
  id: string;
  subject: string;
  instructorName: string;
  rank: number;
};

type TransferRankingTabsProps = {
  rows: RankingRow[];
};

export function TransferRankingTabs({ rows }: TransferRankingTabsProps) {
  const subjects = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => set.add(row.subject));
    return Array.from(set);
  }, [rows]);

  const allRows = useMemo(() => [...rows].sort((a, b) => a.rank - b.rank), [rows]);

  if (!rows.length) {
    return <p className="text-sm text-gray-500">아직 집계된 강사 순위가 없습니다.</p>;
  }

  return (
    <Tabs defaultValue="all">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="all">전체</TabsTrigger>
        {subjects.map((subject) => (
          <TabsTrigger key={subject} value={subject}>
            {subject}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="all" className="mt-3 border-none p-0 bg-transparent">
        <div className="space-y-2.5">
          {allRows.map((row) => (
            <div key={row.id} className="rounded-lg border border-gray-100 px-3 py-2">
              <div>
                <p className="text-xs text-gray-500">{row.subject}</p>
                <p className="text-sm font-semibold">{row.rank}위 {row.instructorName}</p>
              </div>
            </div>
          ))}
        </div>
      </TabsContent>

      {subjects.map((subject) => {
        const subjectRows = allRows.filter((row) => row.subject === subject);
        return (
          <TabsContent key={subject} value={subject} className="mt-3 border-none p-0 bg-transparent">
            <div className="space-y-2.5">
              {subjectRows.map((row) => (
                <div key={row.id} className="rounded-lg border border-gray-100 px-3 py-2">
                  <div>
                    <p className="text-xs text-gray-500">{row.subject}</p>
                    <p className="text-sm font-semibold">{row.rank}위 {row.instructorName}</p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
