"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { emitAuthChange, getUserSnapshot, subscribeAuthChange } from "@/lib/authClient";

type User = {
  id?: string;
  email?: string;
  username?: string;
  nickname?: string;
} | null;

type AdminMeResponse = {
  ok: boolean;
  isAdmin: boolean;
  canBootstrap: boolean;
  adminEmailConfigured: boolean;
  user?: { id: string; email: string };
  error?: string;
};

type RankingItem = {
  id: string;
  subject: string;
  instructorName: string;
  rank: number;
  initialRank: number;
  initialVotes: number;
  realVoteCount: number;
  sourceType: string;
  isSeed: boolean;
  voteCount: number;
  votePercent: number;
};

type CutoffResultType = "불합격" | "추합" | "최초합";
type InputBasisType = "wrong" | "score";

type CutoffItem = {
  id: string;
  examSlug: string;
  university: string;
  major: string;
  year: number;
  resultType: CutoffResultType;
  note: string;
  inputBasis: InputBasisType;
};

type AdminRankingResponse = {
  ok: boolean;
  totalVotes: number;
  rankings: RankingItem[];
  error?: string;
};

type AdminCutoffResponse = {
  ok: boolean;
  cutoffs: CutoffItem[];
  error?: string;
};

function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("access_token") ?? "";
}

export default function AdminPage() {
  const user = useSyncExternalStore(
    subscribeAuthChange,
    () => getUserSnapshot() as User,
    () => null
  );

  const [exam, setExam] = useState<"transfer" | "cpa">("transfer");
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [adminState, setAdminState] = useState<AdminMeResponse | null>(null);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [loadingCutoffs, setLoadingCutoffs] = useState(false);
  const [cutoffs, setCutoffs] = useState<CutoffItem[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    instructorName: "",
    initialRank: "",
    initialVotes: "0",
  });
  const [cutoffForm, setCutoffForm] = useState({
    university: "",
    major: "",
    year: String(new Date().getFullYear()),
    resultType: "최초합" as CutoffResultType,
    inputBasis: "wrong" as InputBasisType,
    note: "",
  });

  const sortedRankings = useMemo(() => {
    return [...rankings].sort((a, b) => a.rank - b.rank || a.subject.localeCompare(b.subject));
  }, [rankings]);
  const sortedCutoffs = useMemo(() => {
    return [...cutoffs].sort(
      (a, b) =>
        b.year - a.year ||
        a.university.localeCompare(b.university) ||
        a.major.localeCompare(b.major)
    );
  }, [cutoffs]);

  const loadAdminMe = async () => {
    const token = getAccessToken();
    if (!token) {
      setAdminState(null);
      setCheckingAdmin(false);
      return;
    }

    setCheckingAdmin(true);
    try {
      const res = await fetch("/api/admin/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await res.json().catch(() => null)) as AdminMeResponse | null;
      if (!res.ok || !payload?.ok) {
        setAdminState({
          ok: false,
          isAdmin: false,
          canBootstrap: false,
          adminEmailConfigured: false,
          error: payload?.error ?? "관리자 상태 확인에 실패했습니다.",
        });
        return;
      }
      setAdminState(payload);
    } catch {
      setAdminState({
        ok: false,
        isAdmin: false,
        canBootstrap: false,
        adminEmailConfigured: false,
        error: "관리자 상태 확인 중 오류가 발생했습니다.",
      });
    } finally {
      setCheckingAdmin(false);
    }
  };

  const loadRankings = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    setLoadingRankings(true);
    try {
      const res = await fetch(`/api/admin/rankings/${exam}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as AdminRankingResponse | null;
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? "강사 목록을 불러오지 못했습니다.");
        setRankings([]);
        setTotalVotes(0);
        return;
      }
      setRankings(payload.rankings ?? []);
      setTotalVotes(payload.totalVotes ?? 0);
    } catch {
      setMessage("강사 목록을 불러오지 못했습니다.");
      setRankings([]);
      setTotalVotes(0);
    } finally {
      setLoadingRankings(false);
    }
  }, [exam]);

  const loadCutoffs = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    setLoadingCutoffs(true);
    try {
      const res = await fetch(`/api/admin/cutoffs?exam=${exam}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as AdminCutoffResponse | null;
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? "커트라인 목록을 불러오지 못했습니다.");
        setCutoffs([]);
        return;
      }
      setCutoffs(payload.cutoffs ?? []);
    } catch {
      setMessage("커트라인 목록을 불러오지 못했습니다.");
      setCutoffs([]);
    } finally {
      setLoadingCutoffs(false);
    }
  }, [exam]);

  useEffect(() => {
    void loadAdminMe();
  }, [user?.id]);

  useEffect(() => {
    if (adminState?.isAdmin) {
      void Promise.all([loadRankings(), loadCutoffs()]);
    }
  }, [adminState?.isAdmin, loadRankings, loadCutoffs]);

  const handleBootstrap = async () => {
    const token = getAccessToken();
    if (!token) return;

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? "관리자 등록에 실패했습니다.");
        return;
      }
      setMessage("관리자 계정으로 등록되었습니다.");
      await loadAdminMe();
    } catch {
      setMessage("관리자 등록 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async () => {
    const token = getAccessToken();
    if (!token) return;

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/rankings/${exam}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: form.subject,
          instructorName: form.instructorName,
          initialRank: form.initialRank.trim() === "" ? undefined : Number(form.initialRank),
          initialVotes: form.initialVotes.trim() === "" ? 0 : Number(form.initialVotes),
        }),
      });

      const payload = (await res.json().catch(() => null)) as AdminRankingResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "저장에 실패했습니다.");
        return;
      }

      setRankings(payload.rankings ?? []);
      setTotalVotes(payload.totalVotes ?? 0);
      setForm((prev) => ({ ...prev, instructorName: "", initialRank: "", initialVotes: "0" }));
      setMessage("강사 데이터가 저장되었습니다.");
    } catch {
      setMessage("저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/rankings/${exam}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });

      const payload = (await res.json().catch(() => null)) as AdminRankingResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "삭제에 실패했습니다.");
        return;
      }

      setRankings(payload.rankings ?? []);
      setTotalVotes(payload.totalVotes ?? 0);
      setMessage("강사 데이터가 삭제되었습니다.");
    } catch {
      setMessage("삭제 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveCutoff = async () => {
    const token = getAccessToken();
    if (!token) return;

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/cutoffs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam,
          university: cutoffForm.university,
          major: cutoffForm.major,
          year: Number(cutoffForm.year),
          resultType: cutoffForm.resultType,
          inputBasis: cutoffForm.inputBasis,
          note: cutoffForm.note,
        }),
      });

      const payload = (await res.json().catch(() => null)) as AdminCutoffResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "커트라인 저장에 실패했습니다.");
        return;
      }

      setCutoffs(payload.cutoffs ?? []);
      setCutoffForm((prev) => ({ ...prev, major: "", note: "" }));
      setMessage("커트라인 데이터가 저장되었습니다.");
    } catch {
      setMessage("커트라인 저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCutoff = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/cutoffs", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, exam }),
      });
      const payload = (await res.json().catch(() => null)) as AdminCutoffResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "커트라인 삭제에 실패했습니다.");
        return;
      }
      setCutoffs(payload.cutoffs ?? []);
      setMessage("커트라인 데이터가 삭제되었습니다.");
    } catch {
      setMessage("커트라인 삭제 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    emitAuthChange();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.10),transparent_58%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl font-bold">관리자 페이지</h1>
            <p className="text-sm text-muted-foreground mt-2">
              강사 초기값 입력, 득표 현황 확인, 순위 데이터 관리
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 space-y-6">
            {!user?.id ? (
              <Card className="border-none shadow-lg">
                <CardContent className="py-8 space-y-3">
                  <p className="text-sm text-muted-foreground">관리자 페이지는 로그인 후 접근할 수 있습니다.</p>
                  <Button asChild>
                    <a href="/signup">회원가입</a>
                  </Button>
                </CardContent>
              </Card>
            ) : checkingAdmin ? (
              <Card className="border-none shadow-lg">
                <CardContent className="py-8">
                  <p className="text-sm text-muted-foreground">관리자 권한 확인 중...</p>
                </CardContent>
              </Card>
            ) : !adminState?.isAdmin ? (
              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">관리자 권한 필요</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    현재 계정은 관리자 권한이 없습니다.
                  </p>
                  {adminState?.canBootstrap ? (
                    <Button onClick={handleBootstrap} disabled={submitting}>
                      {submitting ? "처리 중..." : "내 계정을 관리자 등록"}
                    </Button>
                  ) : (
                    <p className="text-xs text-amber-700">
                      Vercel 환경변수 `ADMIN_EMAILS`에 현재 로그인 이메일을 추가해 주세요.
                    </p>
                  )}
                  <Button variant="outline" onClick={handleLogout}>
                    로그아웃
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={exam === "transfer" ? "default" : "outline"}
                    onClick={() => setExam("transfer")}
                  >
                    편입
                  </Button>
                  <Button
                    variant={exam === "cpa" ? "default" : "outline"}
                    onClick={() => setExam("cpa")}
                  >
                    CPA
                  </Button>
                </div>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">강사 추가</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <Input
                      placeholder="과목 (예: 편입영어)"
                      value={form.subject}
                      onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                    />
                    <Input
                      placeholder="강사명"
                      value={form.instructorName}
                      onChange={(e) => setForm((prev) => ({ ...prev, instructorName: e.target.value }))}
                    />
                    <Input
                      placeholder="초기순위 (예: 1)"
                      inputMode="numeric"
                      value={form.initialRank}
                      onChange={(e) => setForm((prev) => ({ ...prev, initialRank: e.target.value }))}
                    />
                    <Input
                      placeholder="초기득표수 (예: 30)"
                      inputMode="numeric"
                      value={form.initialVotes}
                      onChange={(e) => setForm((prev) => ({ ...prev, initialVotes: e.target.value }))}
                    />
                    <div className="md:col-span-4">
                      <p className="mb-2 text-xs text-muted-foreground">
                        최종순위는 (실제득표수 + 초기득표수) 기준으로 자동 계산됩니다. 동률이면 초기순위가 우선됩니다.
                      </p>
                      <Button onClick={handleSave} disabled={submitting}>
                        {submitting ? "저장 중..." : "저장"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      등록 강사 / 득표 현황 (총 {totalVotes.toLocaleString()}표)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {loadingRankings ? (
                      <p className="text-sm text-muted-foreground">불러오는 중...</p>
                    ) : sortedRankings.length ? (
                      sortedRankings.map((item) => (
                        <div key={item.id} className="rounded-lg border border-border px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs text-gray-500">{item.subject}</p>
                              <p className="text-sm font-semibold">
                                {item.rank}위 {item.instructorName}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {item.voteCount}표 ({item.votePercent}%)
                              </p>
                              <p className="text-xs text-muted-foreground">
                                초기순위 {item.initialRank} · 초기득표 {item.initialVotes} · 실투표 {item.realVoteCount}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleDelete(item.id)}
                              disabled={submitting}
                            >
                              삭제
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">등록된 강사가 없습니다.</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">편입 합격 커트라인 관리</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                      <Input
                        placeholder="학교명"
                        value={cutoffForm.university}
                        onChange={(e) =>
                          setCutoffForm((prev) => ({ ...prev, university: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="학과명"
                        value={cutoffForm.major}
                        onChange={(e) =>
                          setCutoffForm((prev) => ({ ...prev, major: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="년도"
                        inputMode="numeric"
                        value={cutoffForm.year}
                        onChange={(e) =>
                          setCutoffForm((prev) => ({ ...prev, year: e.target.value }))
                        }
                      />
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={cutoffForm.resultType}
                        onChange={(e) =>
                          setCutoffForm((prev) => ({
                            ...prev,
                            resultType: e.target.value as CutoffResultType,
                          }))
                        }
                      >
                        <option value="불합격">불합격</option>
                        <option value="추합">추합</option>
                        <option value="최초합">최초합</option>
                      </select>
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={cutoffForm.inputBasis}
                        onChange={(e) =>
                          setCutoffForm((prev) => ({
                            ...prev,
                            inputBasis: e.target.value as InputBasisType,
                          }))
                        }
                      >
                        <option value="wrong">틀린개수 기준</option>
                        <option value="score">점수 기준</option>
                      </select>
                      <Input
                        placeholder="비고 (선택)"
                        value={cutoffForm.note}
                        onChange={(e) =>
                          setCutoffForm((prev) => ({ ...prev, note: e.target.value }))
                        }
                      />
                      <div className="md:col-span-6">
                        <Button onClick={handleSaveCutoff} disabled={submitting}>
                          {submitting ? "저장 중..." : "커트라인 저장"}
                        </Button>
                      </div>
                    </div>

                    {loadingCutoffs ? (
                      <p className="text-sm text-muted-foreground">커트라인 목록 불러오는 중...</p>
                    ) : sortedCutoffs.length ? (
                      <div className="space-y-2">
                        {sortedCutoffs.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-border px-3 py-3 flex items-center justify-between gap-3"
                          >
                            <div>
                              <p className="text-sm font-semibold">
                                {item.year} · {item.university} {item.major}
                              </p>
                              <p className="text-xs text-primary mt-1">{item.resultType}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                기준: {item.inputBasis === "wrong" ? "틀린개수" : "점수"}
                              </p>
                              {item.note ? (
                                <p className="text-xs text-muted-foreground mt-1">{item.note}</p>
                              ) : null}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleDeleteCutoff(item.id)}
                              disabled={submitting}
                            >
                              삭제
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        등록된 커트라인 데이터가 없습니다.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {message && <p className="text-sm text-primary">{message}</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
