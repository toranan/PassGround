"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { ImageIcon, Loader2, X } from "lucide-react";

type User = {
  id?: string;
  username?: string;
  nickname?: string;
};

type UploadedEvidence = {
  url: string;
  filename: string;
};

const transferTypes = [
  { value: "transfer_passer", label: "편입 합격증 인증" },
  { value: "transfer_finalist", label: "최초/추합 증빙" },
];

const cpaTypes = [
  { value: "cpa_first_passer", label: "CPA 1차 합격 인증" },
  { value: "cpa_accountant", label: "현직 회계사 인증" },
];

export default function VerificationPage() {
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const [examSlug, setExamSlug] = useState<"transfer" | "cpa">("transfer");
  const [verificationType, setVerificationType] = useState("transfer_passer");
  const [evidence, setEvidence] = useState<UploadedEvidence | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [memo, setMemo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const user: User | null = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }, []);

  const name = user?.nickname || user?.username || "";
  const typeOptions = examSlug === "transfer" ? transferTypes : cpaTypes;

  const handleExamChange = (nextExam: "transfer" | "cpa") => {
    if ((!ENABLE_CPA || !ENABLE_CPA_WRITE) && nextExam === "cpa") {
      return;
    }
    setExamSlug(nextExam);
    setVerificationType(nextExam === "transfer" ? "transfer_passer" : "cpa_first_passer");
  };

  const handleSubmit = async () => {
    setMessage("");

    if (!name) {
      setMessage("로그인 후 인증 신청이 가능합니다.");
      return;
    }

    if (!evidence?.url) {
      setMessage("합격증 이미지를 업로드해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id,
          requesterName: name,
          examSlug,
          verificationType,
          evidenceUrl: evidence.url,
          memo: memo.trim(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage((data && data.error) || "인증 신청에 실패했습니다.");
        return;
      }

      setMessage("인증 신청이 접수되었습니다. 운영진 검수 후 반영됩니다.");
      setEvidence(null);
      setMemo("");
    } catch {
      setMessage("인증 신청 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEvidenceSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFile = e.target.files?.[0];
    if (!inputFile) return;

    setMessage("");
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", inputFile);
      formData.append("usage", "verification");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setMessage(data?.error || "이미지 업로드에 실패했습니다.");
        return;
      }

      setEvidence({ url: data.url, filename: data.filename || inputFile.name });
      setMessage("합격증 이미지가 업로드되었습니다. 제출하면 운영진 검수 대기로 접수됩니다.");
    } catch {
      setMessage("이미지 업로드 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
      if (evidenceInputRef.current) {
        evidenceInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.08),transparent_60%)]">
          <div className="container mx-auto px-4 py-8 md:py-10">
            <h1 className="font-display text-3xl font-bold">인증 신청</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {ENABLE_CPA && ENABLE_CPA_WRITE
                ? "합격증/1차합격/현직 인증을 통해 답변 신뢰도를 높일 수 있습니다."
                : "편입 합격증 인증을 통해 답변 신뢰도를 높일 수 있습니다."}
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>인증 정보 입력</CardTitle>
                <CardDescription>합격증 이미지를 업로드하면 운영진 검수함으로 접수됩니다.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">신청자</label>
                  <Input value={name} readOnly placeholder="로그인이 필요합니다" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">서비스</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={examSlug === "transfer" ? "default" : "outline"}
                      className={examSlug === "transfer" ? "bg-primary hover:bg-primary/90" : ""}
                      onClick={() => handleExamChange("transfer")}
                    >
                      편입
                    </Button>
                    {ENABLE_CPA && ENABLE_CPA_WRITE && (
                      <Button
                        type="button"
                        variant={examSlug === "cpa" ? "default" : "outline"}
                        className={examSlug === "cpa" ? "bg-primary hover:bg-primary/90" : ""}
                        onClick={() => handleExamChange("cpa")}
                      >
                        CPA
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">인증 유형</label>
                  <select
                    value={verificationType}
                    onChange={(e) => setVerificationType(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {typeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">합격증 이미지</label>
                  <input
                    ref={evidenceInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleEvidenceSelect}
                    className="hidden"
                  />
                  <div className="rounded-md border border-dashed p-3 space-y-3">
                    {evidence ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={evidence.url}
                          alt={evidence.filename}
                          className="h-16 w-16 rounded-md object-cover border"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{evidence.filename}</p>
                          <p className="text-xs text-muted-foreground">운영진 검수 대기용 증빙 이미지</p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setEvidence(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">JPG/PNG/GIF/WEBP, 최대 5MB</p>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => evidenceInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          업로드 중...
                        </>
                      ) : (
                        <>
                          <ImageIcon className="h-4 w-4 mr-2" />
                          합격증 사진 업로드
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">메모 (선택)</label>
                  <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="w-full min-h-[110px] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
                    placeholder="검수 시 참고할 내용을 적어주세요."
                  />
                </div>

                {message && (
                  <p className={`text-sm ${message.includes("실패") || message.includes("오류") ? "text-red-600" : "text-primary"}`}>
                    {message}
                  </p>
                )}

                <Button
                  type="button"
                  className="bg-primary hover:bg-primary/90"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "제출 중..." : "인증 신청 제출"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg h-fit">
              <CardHeader>
                <CardTitle>검수 기준</CardTitle>
                <CardDescription className="text-sm">
                  운영진이 인증 상태를 검수한 뒤 프로필 배지를 부여합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                <p>1. 식별 가능한 합격/자격 증빙이어야 합니다.</p>
                <p>2. 개인정보는 가림 처리 후 업로드하세요.</p>
                <p>3. 허위 인증 시 계정 제재 및 포인트 회수됩니다.</p>
                {!name && (
                  <Button asChild size="sm" className="mt-3 bg-primary hover:bg-primary/90">
                    <Link href="/signup">회원가입</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
