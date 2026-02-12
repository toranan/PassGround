"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AuthCallbackError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
            <div className="max-w-sm w-full space-y-4 text-center">
                <h2 className="text-xl font-bold">로그인 처리 중 오류가 발생했습니다</h2>
                <p className="text-sm text-muted-foreground">
                    {error?.message || "알 수 없는 오류가 발생했습니다. 다시 시도해 주세요."}
                </p>
                <div className="flex gap-2 justify-center">
                    <Button variant="outline" onClick={reset}>
                        다시 시도
                    </Button>
                    <Button asChild>
                        <Link href="/signup">회원가입으로 돌아가기</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
