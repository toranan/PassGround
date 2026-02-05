"use client";

import { useEffect, useState } from "react";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

type DDayExam = {
    id: string;
    title: string;
    date: string; // YYYY-MM-DD
};

// Mock data for major exams (2025/2026 approximate dates for demo)
const UPCOMING_EXAMS: DDayExam[] = [
    { id: "1", title: "2026 CPA 1차 시험", date: "2026-02-22" },
    { id: "2", title: "2026 9급 국가직", date: "2026-04-04" },
    { id: "3", title: "2026 변호사 시험", date: "2026-01-09" }, // Already passed test
    { id: "4", title: "2026 노무사 1차", date: "2026-05-23" },
];

export function DDayWidget() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const calculateDDay = (targetDate: string) => {
        const target = new Date(targetDate);
        target.setHours(0, 0, 0, 0);
        const diffTime = target.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
            {UPCOMING_EXAMS.map((exam) => {
                const dDay = calculateDDay(exam.date);
                const isPassed = dDay < 0;
                const dDayText = isPassed ? `D+${Math.abs(dDay)}` : dDay === 0 ? "D-Day" : `D-${dDay}`;

                return (
                    <Card key={exam.id} className="border bg-background/50 backdrop-blur shadow-sm hover:shadow-md transition-all">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-1 px-2.5">
                            <CardTitle className="text-[12px] font-medium text-muted-foreground leading-none">
                                {exam.title}
                            </CardTitle>
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        </CardHeader>
                        <CardFooter className="pt-0 pb-1 px-2.5">
                            <div className={`text-xl font-bold leading-none ${dDay <= 30 && dDay >= 0 ? "text-red-500" : ""}`}>
                                {dDayText}
                            </div>
                            <div className="text-[11px] text-muted-foreground ml-auto leading-none">
                                {exam.date}
                            </div>
                        </CardFooter>
                    </Card>
                );
            })}
        </div>
    );
}
