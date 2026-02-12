"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getIsMemberSnapshot, subscribeAuthChange } from "@/lib/authClient";

type CutoffRow = {
  id: string;
  university: string;
  major: string;
  year: number;
  scoreBand: string;
  note: string;
};

type CutoffTableProps = {
  rows: CutoffRow[];
};

export function CutoffTable({ rows }: CutoffTableProps) {
  const isMember = useSyncExternalStore(
    subscribeAuthChange,
    getIsMemberSnapshot,
    () => false
  );

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="space-y-3">
        <CardTitle className="text-lg">학교/년도별 합격 커트라인 표</CardTitle>
        {!isMember && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            커트라인 수치 확인은 회원가입 후 가능합니다.
            <div className="mt-2 flex gap-2">
              <Button asChild size="sm" className="h-7 bg-primary px-3 text-xs hover:bg-primary/90">
                <Link href="/signup">회원가입</Link>
              </Button>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-gray-100 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm">{row.university} {row.major}</p>
              <span className="text-xs text-gray-500">{row.year}</span>
            </div>
            <p className="text-sm text-primary font-semibold mt-1">
              {isMember ? row.scoreBand : "?? ~ ??"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {isMember ? row.note : "회원 전용 데이터"}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
