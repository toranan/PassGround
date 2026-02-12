"use client";

import { Navbar } from "@/components/Navbar";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ENABLE_SOCIAL_AUTH } from "@/lib/featureFlags";

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.08),transparent_60%)]">
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-md mx-auto">
              <Card className="border-none shadow-lg">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl">회원가입</CardTitle>
                  <CardDescription>
                    카카오, 네이버, 구글 소셜 계정으로 바로 시작하세요.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ENABLE_SOCIAL_AUTH ? (
                    <SocialAuthButtons redirectTo="/mypage" />
                  ) : (
                    <p className="text-sm text-red-600">
                      소셜 회원가입이 비활성화되어 있습니다.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
