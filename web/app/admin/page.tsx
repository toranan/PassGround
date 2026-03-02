"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { emitAuthChange, getUserSnapshot, subscribeAuthChange } from "@/lib/authClient";
import { cutoffTrackLabel, type CutoffTrackType } from "@/lib/cutoffTrack";

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

type InputBasisType = "wrong" | "score";

type CutoffItem = {
  id: string;
  examSlug: string;
  university: string;
  major: string;
  year: number;
  waitlistCutoff: number | null;
  initialCutoff: number | null;
  memo: string;
  inputBasis: InputBasisType;
  track: CutoffTrackType;
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

type ScheduleItem = {
  id: string;
  examSlug: string;
  title: string;
  category: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  organizer: string | null;
  linkUrl: string | null;
  isOfficial: boolean;
  note: string | null;
};

type AdminScheduleResponse = {
  ok: boolean;
  schedules: ScheduleItem[];
  error?: string;
};

type NewsItem = {
  id: string;
  title: string;
  content: string;
  linkUrl?: string | null;
  attachments?: UploadedAsset[];
  createdAt: string;
};

type AdminNewsResponse = {
  ok: boolean;
  news: NewsItem[];
  error?: string;
};

type UploadedAsset = {
  url: string;
  filename: string;
};

type KnowledgeItem = {
  id: string;
  examSlug: string;
  rawInput: string;
  question: string;
  answer: string;
  tags: string[];
  status: "pending" | "approved";
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};

type AdminKnowledgeResponse = {
  ok: boolean;
  pending: KnowledgeItem[];
  approved: KnowledgeItem[];
  bulkInsertedCount?: number;
  directInserted?: boolean;
  ragSyncError?: string | null;
  error?: string;
};

type AdminKnowledgeReindexResponse = {
  ok: boolean;
  exam: "transfer" | "cpa";
  approvedCount: number;
  chunkCount: number;
  message?: string;
  error?: string;
};

type UnansweredQuestionItem = {
  question: string;
  normalizedQuestion: string;
  count: number;
  lastSeenAt: string;
};

type AdminUnansweredQuestionsResponse = {
  ok: boolean;
  exam: "transfer" | "cpa";
  totalFallbackLogs: number;
  uniqueQuestionCount: number;
  items: UnansweredQuestionItem[];
  error?: string;
};

type SubmittedQuestionItem = {
  id: string;
  examSlug: "transfer" | "cpa";
  question: string;
  userId: string | null;
  userEmail: string;
  source: string;
  status: string;
  traceId: string;
  createdAt: string;
};

type AdminSubmittedQuestionsResponse = {
  ok: boolean;
  exam: "transfer" | "cpa";
  totalCount: number;
  items: SubmittedQuestionItem[];
  error?: string;
};

function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("access_token") ?? "";
}

function toLocalDateTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateLabel(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseTagsInput(value: string): string[] {
  const dedup = new Set<string>();
  for (const token of value.split(/[,\n]/g)) {
    const normalized = token.trim();
    if (normalized) dedup.add(normalized);
  }
  return [...dedup];
}

function normalizeHttpUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
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
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [knowledgePending, setKnowledgePending] = useState<KnowledgeItem[]>([]);
  const [knowledgeApproved, setKnowledgeApproved] = useState<KnowledgeItem[]>([]);
  const [loadingUnansweredQuestions, setLoadingUnansweredQuestions] = useState(false);
  const [unansweredQuestions, setUnansweredQuestions] = useState<UnansweredQuestionItem[]>([]);
  const [fallbackLogCount, setFallbackLogCount] = useState(0);
  const [loadingSubmittedQuestions, setLoadingSubmittedQuestions] = useState(false);
  const [submittedQuestions, setSubmittedQuestions] = useState<SubmittedQuestionItem[]>([]);
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
    track: "general" as CutoffTrackType,
    inputBasis: "wrong" as InputBasisType,
    waitlistCutoff: "",
    initialCutoff: "",
    memo: "",
  });
  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    category: "원서접수",
    startsAt: toLocalDateTimeInput(new Date()),
    endsAt: "",
    location: "",
    organizer: "",
    linkUrl: "",
    note: "",
  });
  const [newsForm, setNewsForm] = useState({
    title: "",
    content: "",
    linkUrl: "",
  });
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [newsAttachment, setNewsAttachment] = useState<UploadedAsset | null>(null);
  const [uploadingNewsAttachment, setUploadingNewsAttachment] = useState(false);
  const [knowledgeRawInput, setKnowledgeRawInput] = useState("");
  const [knowledgeBulkRawInput, setKnowledgeBulkRawInput] = useState("");
  const [knowledgeDirectInput, setKnowledgeDirectInput] = useState("");
  const [knowledgeDirectTitle, setKnowledgeDirectTitle] = useState("");
  const [knowledgeDirectTags, setKnowledgeDirectTags] = useState("");
  const [knowledgeInfoForm, setKnowledgeInfoForm] = useState({
    admissionYear: String(new Date().getFullYear()),
    university: "",
    majorTrack: "",
    sourceLabel: "",
    rawText: "",
  });
  const [knowledgePdfFile, setKnowledgePdfFile] = useState<File | null>(null);
  const [knowledgePdfNote, setKnowledgePdfNote] = useState("");
  const [knowledgePdfTags, setKnowledgePdfTags] = useState("");
  const [reindexingKnowledge, setReindexingKnowledge] = useState(false);

  const sortedRankings = useMemo(() => {
    return [...rankings].sort((a, b) => a.rank - b.rank || a.subject.localeCompare(b.subject));
  }, [rankings]);
  const sortedCutoffs = useMemo(() => {
    return [...cutoffs].sort(
      (a, b) =>
        b.year - a.year ||
        a.university.localeCompare(b.university) ||
        a.major.localeCompare(b.major) ||
        a.track.localeCompare(b.track)
    );
  }, [cutoffs]);
  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => {
      const left = new Date(a.startsAt).getTime();
      const right = new Date(b.startsAt).getTime();
      if (left !== right) return left - right;
      return a.title.localeCompare(b.title);
    });
  }, [schedules]);
  const sortedNews = useMemo(() => {
    return [...news].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [news]);
  const sortedKnowledgeApproved = useMemo(() => {
    return [...knowledgeApproved].sort(
      (a, b) => new Date(b.approvedAt || b.updatedAt).getTime() - new Date(a.approvedAt || a.updatedAt).getTime()
    );
  }, [knowledgeApproved]);

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

  const loadSchedules = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    setLoadingSchedules(true);
    try {
      const res = await fetch(`/api/admin/schedules?exam=${exam}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as AdminScheduleResponse | null;
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? "일정 목록을 불러오지 못했습니다.");
        setSchedules([]);
        return;
      }
      setSchedules(payload.schedules ?? []);
    } catch {
      setMessage("일정 목록을 불러오지 못했습니다.");
      setSchedules([]);
    } finally {
      setLoadingSchedules(false);
    }
  }, [exam]);

  const loadNews = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    setLoadingNews(true);
    try {
      const res = await fetch(`/api/admin/news?exam=${exam}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as AdminNewsResponse | null;
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? "최신뉴스 목록을 불러오지 못했습니다.");
        setNews([]);
        return;
      }
      setNews(payload.news ?? []);
    } catch {
      setMessage("최신뉴스 목록을 불러오지 못했습니다.");
      setNews([]);
    } finally {
      setLoadingNews(false);
    }
  }, [exam]);

  const loadKnowledge = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    setLoadingKnowledge(true);
    try {
      const res = await fetch(`/api/admin/knowledge?exam=${exam}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as AdminKnowledgeResponse | null;
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? "AI 지식 목록을 불러오지 못했습니다.");
        setKnowledgePending([]);
        setKnowledgeApproved([]);
        return;
      }
      setKnowledgePending(payload.pending ?? []);
      setKnowledgeApproved(payload.approved ?? []);
    } catch {
      setMessage("AI 지식 목록을 불러오지 못했습니다.");
      setKnowledgePending([]);
      setKnowledgeApproved([]);
    } finally {
      setLoadingKnowledge(false);
    }
  }, [exam]);

  const loadUnansweredQuestions = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    setLoadingUnansweredQuestions(true);
    try {
      const res = await fetch(`/api/admin/questions/unanswered?exam=${exam}&scanLimit=1000&topK=50`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as AdminUnansweredQuestionsResponse | null;
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? "미해결 질문 목록을 불러오지 못했습니다.");
        setUnansweredQuestions([]);
        setFallbackLogCount(0);
        return;
      }
      setUnansweredQuestions(payload.items ?? []);
      setFallbackLogCount(payload.totalFallbackLogs ?? 0);
    } catch {
      setMessage("미해결 질문 목록을 불러오지 못했습니다.");
      setUnansweredQuestions([]);
      setFallbackLogCount(0);
    } finally {
      setLoadingUnansweredQuestions(false);
    }
  }, [exam]);

  const loadSubmittedQuestions = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    setLoadingSubmittedQuestions(true);
    try {
      const res = await fetch(`/api/admin/questions/submissions?exam=${exam}&limit=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as AdminSubmittedQuestionsResponse | null;
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? "질문하기 접수 목록을 불러오지 못했습니다.");
        setSubmittedQuestions([]);
        return;
      }
      setSubmittedQuestions(payload.items ?? []);
    } catch {
      setMessage("질문하기 접수 목록을 불러오지 못했습니다.");
      setSubmittedQuestions([]);
    } finally {
      setLoadingSubmittedQuestions(false);
    }
  }, [exam]);

  useEffect(() => {
    void loadAdminMe();
  }, [user?.id]);

  useEffect(() => {
    if (adminState?.isAdmin) {
      void Promise.all([
        loadRankings(),
        loadCutoffs(),
        loadSchedules(),
        loadNews(),
        loadKnowledge(),
        loadUnansweredQuestions(),
        loadSubmittedQuestions(),
      ]);
    }
  }, [adminState?.isAdmin, loadRankings, loadCutoffs, loadSchedules, loadNews, loadKnowledge, loadUnansweredQuestions, loadSubmittedQuestions]);

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
          track: cutoffForm.track,
          inputBasis: cutoffForm.inputBasis,
          waitlistCutoff:
            cutoffForm.waitlistCutoff.trim() === "" ? undefined : Number(cutoffForm.waitlistCutoff),
          initialCutoff:
            cutoffForm.initialCutoff.trim() === "" ? undefined : Number(cutoffForm.initialCutoff),
          memo: cutoffForm.memo,
        }),
      });

      const payload = (await res.json().catch(() => null)) as AdminCutoffResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "커트라인 저장에 실패했습니다.");
        return;
      }

      setCutoffs(payload.cutoffs ?? []);
      setCutoffForm((prev) => ({ ...prev, major: "", waitlistCutoff: "", initialCutoff: "", memo: "" }));
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

  const handleSaveSchedule = async () => {
    const token = getAccessToken();
    if (!token) return;

    const startsAtDate = scheduleForm.startsAt ? new Date(scheduleForm.startsAt) : null;
    const endsAtDate = scheduleForm.endsAt ? new Date(scheduleForm.endsAt) : null;
    if (!scheduleForm.title.trim() || !startsAtDate || Number.isNaN(startsAtDate.getTime())) {
      setMessage("일정 제목과 시작일시는 필수입니다.");
      return;
    }
    if (scheduleForm.endsAt && (!endsAtDate || Number.isNaN(endsAtDate.getTime()))) {
      setMessage("종료일시 형식이 올바르지 않습니다.");
      return;
    }
    if (endsAtDate && endsAtDate.getTime() < startsAtDate.getTime()) {
      setMessage("종료일시는 시작일시보다 이후여야 합니다.");
      return;
    }

    const startsAtIso = startsAtDate.toISOString();
    const endsAtIso = endsAtDate ? endsAtDate.toISOString() : null;

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/schedules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam,
          title: scheduleForm.title,
          category: scheduleForm.category,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
          location: scheduleForm.location,
          organizer: scheduleForm.organizer,
          linkUrl: scheduleForm.linkUrl,
          note: scheduleForm.note,
          isOfficial: true,
        }),
      });
      const payload = (await res.json().catch(() => null)) as AdminScheduleResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "일정 저장에 실패했습니다.");
        return;
      }
      setSchedules(payload.schedules ?? []);
      setScheduleForm((prev) => ({
        ...prev,
        title: "",
        endsAt: "",
        location: "",
        organizer: "",
        linkUrl: "",
        note: "",
      }));
      setMessage("일정이 저장되었습니다.");
    } catch {
      setMessage("일정 저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/schedules", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, exam }),
      });
      const payload = (await res.json().catch(() => null)) as AdminScheduleResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "일정 삭제에 실패했습니다.");
        return;
      }
      setSchedules(payload.schedules ?? []);
      setMessage("일정이 삭제되었습니다.");
    } catch {
      setMessage("일정 삭제 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveNews = async () => {
    const token = getAccessToken();
    if (!token) return;

    const title = newsForm.title.trim();
    const content = newsForm.content.trim();
    const linkUrl = normalizeHttpUrl(newsForm.linkUrl);

    if (!title) {
      setMessage("최신뉴스 제목은 필수입니다.");
      return;
    }
    if (newsForm.linkUrl.trim() && !linkUrl) {
      setMessage("링크 URL 형식을 확인해줘. (http/https)");
      return;
    }
    if (!content && !linkUrl && !newsAttachment?.url) {
      setMessage("내용/링크/첨부 중 하나는 입력해줘.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/news", {
        method: editingNewsId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingNewsId,
          exam,
          title,
          content,
          linkUrl,
          attachments: newsAttachment
            ? [{ url: newsAttachment.url, filename: newsAttachment.filename }]
            : [],
        }),
      });
      const payload = (await res.json().catch(() => null)) as AdminNewsResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage(
          (payload && "error" in payload && payload.error) ||
            (editingNewsId ? "최신뉴스 수정에 실패했습니다." : "최신뉴스 저장에 실패했습니다.")
        );
        return;
      }
      setNews(payload.news ?? []);
      setNewsForm({ title: "", content: "", linkUrl: "" });
      setNewsAttachment(null);
      setEditingNewsId(null);
      setMessage(editingNewsId ? "최신뉴스가 수정되었습니다." : "최신뉴스가 저장되었습니다.");
    } catch {
      setMessage(editingNewsId ? "최신뉴스 수정 중 오류가 발생했습니다." : "최신뉴스 저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEditNews = (item: NewsItem) => {
    setEditingNewsId(item.id);
    setNewsForm({
      title: item.title ?? "",
      content: item.content ?? "",
      linkUrl: item.linkUrl ?? "",
    });
    setNewsAttachment(item.attachments?.[0] ?? null);
    setMessage("수정 모드로 불러왔습니다. 내용 수정 후 저장을 눌러주세요.");
  };

  const handleCancelEditNews = () => {
    setEditingNewsId(null);
    setNewsForm({ title: "", content: "", linkUrl: "" });
    setNewsAttachment(null);
    setMessage("최신뉴스 수정 모드를 취소했습니다.");
  };

  const handleUploadNewsAttachment = async (file: File | null) => {
    if (!file) return;

    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      setMessage("파일 크기는 15MB 이하여야 해.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setMessage("로그인 후 다시 시도해줘.");
      return;
    }

    setUploadingNewsAttachment(true);
    setMessage("");
    try {
      const signRes = await fetch("/api/admin/news/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });
      const signPayload = (await signRes.json().catch(() => null)) as
        | {
            ok?: boolean;
            bucket?: string;
            path?: string;
            token?: string;
            signedUrl?: string;
            publicUrl?: string;
            filename?: string;
            error?: string;
          }
        | null;
      if (
        !signRes.ok ||
        !signPayload?.ok ||
        !signPayload.bucket ||
        !signPayload.path ||
        !signPayload.token ||
        !signPayload.signedUrl ||
        !signPayload.publicUrl
      ) {
        setMessage(signPayload?.error ?? "첨부 파일 업로드 URL 발급에 실패했습니다.");
        return;
      }

      const uploadFormData = new FormData();
      uploadFormData.append("cacheControl", "3600");
      uploadFormData.append("", file);
      const uploadRes = await fetch(signPayload.signedUrl, {
        method: "PUT",
        headers: {
          "x-upsert": "false",
        },
        body: uploadFormData,
      });
      if (!uploadRes.ok) {
        const uploadText = await uploadRes.text().catch(() => "");
        setMessage(uploadText || "첨부 파일 업로드에 실패했습니다.");
        return;
      }

      setNewsAttachment({
        url: signPayload.publicUrl,
        filename: signPayload.filename || file.name,
      });
      setMessage("첨부 파일 업로드가 완료되었습니다.");
    } catch {
      setMessage("첨부 파일 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingNewsAttachment(false);
    }
  };

  const handleDeleteNews = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/news", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, exam }),
      });
      const payload = (await res.json().catch(() => null)) as AdminNewsResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "최신뉴스 삭제에 실패했습니다.");
        return;
      }
      setNews(payload.news ?? []);
      setMessage("최신뉴스가 삭제되었습니다.");
    } catch {
      setMessage("최신뉴스 삭제 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateKnowledgeDraft = async () => {
    const token = getAccessToken();
    if (!token) return;

    if (!knowledgeRawInput.trim()) {
      setMessage("날것 입력 내용을 먼저 적어주세요.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam,
          rawInput: knowledgeRawInput,
        }),
      });
      const payload = (await res.json().catch(() => null)) as AdminKnowledgeResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "AI 지식 초안 생성에 실패했습니다.");
        return;
      }
      setKnowledgePending(payload.pending ?? []);
      setKnowledgeApproved(payload.approved ?? []);
      setKnowledgeRawInput("");
      setMessage("AI 지식 초안을 만들었습니다. 내용 확인 후 승인 반영해 주세요.");
    } catch {
      setMessage("AI 지식 초안 생성 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateKnowledgeFromInfoTab = async () => {
    const token = getAccessToken();
    if (!token) return;

    const admissionYear = knowledgeInfoForm.admissionYear.trim();
    const university = knowledgeInfoForm.university.trim();
    const majorTrack = knowledgeInfoForm.majorTrack.trim();
    const sourceLabel = knowledgeInfoForm.sourceLabel.trim();
    const rawText = knowledgeInfoForm.rawText.trim();

    if (!rawText) {
      setMessage("붙여넣을 정보 본문을 입력해 주세요.");
      return;
    }
    if (admissionYear && !/^\d{4}$/.test(admissionYear)) {
      setMessage("학년도는 4자리 숫자(예: 2026)로 입력해 주세요.");
      return;
    }

    const metadataLines = [
      admissionYear ? `학년도: ${admissionYear}` : "",
      university ? `학교: ${university}` : "",
      majorTrack ? `학과/전형: ${majorTrack}` : "",
      sourceLabel ? `출처: ${sourceLabel}` : "",
    ].filter(Boolean);

    const mergedRawInput = [
      metadataLines.length ? `[메타데이터]\n${metadataLines.join("\n")}` : "",
      `[원문]\n${rawText}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const tagSet = new Set<string>(["편입", "전형정보"]);
    if (admissionYear) {
      tagSet.add(admissionYear);
      tagSet.add(`${admissionYear}학년도`);
    }
    if (university) tagSet.add(university);
    if (majorTrack) tagSet.add(majorTrack);

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam,
          rawInput: mergedRawInput,
          tags: [...tagSet],
        }),
      });
      const payload = (await res.json().catch(() => null)) as AdminKnowledgeResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "정보 넣기 초안 생성에 실패했습니다.");
        return;
      }
      setKnowledgePending(payload.pending ?? []);
      setKnowledgeApproved(payload.approved ?? []);
      setKnowledgeInfoForm((prev) => ({
        ...prev,
        rawText: "",
      }));
      setMessage("정보 넣기 초안 생성 완료. 아래 검수 대기에서 확인 후 승인 반영해 주세요.");
    } catch {
      setMessage("정보 넣기 처리 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateKnowledgeBulkQA = async () => {
    const token = getAccessToken();
    if (!token) return;

    const bulkText = knowledgeBulkRawInput.trim();
    if (!bulkText) {
      setMessage("Q/A 본문을 먼저 붙여넣어 주세요.");
      return;
    }

    const admissionYear = knowledgeInfoForm.admissionYear.trim();
    const university = knowledgeInfoForm.university.trim();
    const majorTrack = knowledgeInfoForm.majorTrack.trim();
    const tagSet = new Set<string>(["편입", "전형정보", "FAQ"]);
    if (admissionYear) {
      tagSet.add(admissionYear);
      tagSet.add(`${admissionYear}학년도`);
    }
    if (university) tagSet.add(university);
    if (majorTrack) tagSet.add(majorTrack);

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam,
          bulkRawInput: bulkText,
          tags: [...tagSet],
        }),
      });
      const payload = (await res.json().catch(() => null)) as AdminKnowledgeResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "Q/A 일괄 초안 생성에 실패했습니다.");
        return;
      }
      setKnowledgePending(payload.pending ?? []);
      setKnowledgeApproved(payload.approved ?? []);
      setKnowledgeBulkRawInput("");
      const inserted = typeof payload.bulkInsertedCount === "number" ? payload.bulkInsertedCount : 0;
      setMessage(`Q/A 본문 ${inserted}개를 초안으로 저장했습니다. 아래에서 검수 후 승인 반영하세요.`);
    } catch {
      setMessage("Q/A 일괄 처리 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDirectIngestKnowledge = async () => {
    const token = getAccessToken();
    if (!token) return;

    const rawText = knowledgeDirectInput.trim();
    if (!rawText) {
      setMessage("직접 반영할 본문을 입력해 주세요.");
      return;
    }

    const admissionYear = knowledgeInfoForm.admissionYear.trim();
    const university = knowledgeInfoForm.university.trim();
    const majorTrack = knowledgeInfoForm.majorTrack.trim();
    const tagSet = new Set<string>(parseTagsInput(knowledgeDirectTags));
    tagSet.add("편입");
    if (admissionYear) {
      tagSet.add(admissionYear);
      tagSet.add(`${admissionYear}학년도`);
    }
    if (university) tagSet.add(university);
    if (majorTrack) tagSet.add(majorTrack);

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam,
          directRawInput: rawText,
          directTitle: knowledgeDirectTitle.trim(),
          tags: [...tagSet],
        }),
      });
      const payload = (await res.json().catch(() => null)) as AdminKnowledgeResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "원문 즉시 반영에 실패했습니다.");
        return;
      }

      setKnowledgePending(payload.pending ?? []);
      setKnowledgeApproved(payload.approved ?? []);
      setKnowledgeDirectInput("");
      setKnowledgeDirectTitle("");
      setKnowledgeDirectTags("");
      if (payload.ragSyncError) {
        setMessage(`원문은 저장됐지만 색인 동기화 경고가 있어: ${payload.ragSyncError}`);
      } else {
        setMessage("원문을 승인 상태로 즉시 반영하고 색인까지 완료했습니다.");
      }
    } catch {
      setMessage("원문 즉시 반영 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadKnowledgePdf = async () => {
    const token = getAccessToken();
    if (!token) return;
    if (!knowledgePdfFile) {
      setMessage("업로드할 PDF 파일을 선택해 주세요.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.set("exam", exam);
      formData.set("file", knowledgePdfFile);
      if (knowledgePdfNote.trim()) formData.set("note", knowledgePdfNote.trim());
      if (knowledgePdfTags.trim()) formData.set("tags", knowledgePdfTags.trim());

      const res = await fetch("/api/admin/knowledge/pdf", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? "PDF 업로드 후 초안 생성에 실패했습니다.");
        return;
      }

      setKnowledgePdfFile(null);
      setKnowledgePdfNote("");
      setKnowledgePdfTags("");
      await loadKnowledge();
      setMessage("PDF 업로드 완료. 검수 대기에 초안이 생성되었습니다.");
    } catch {
      setMessage("PDF 업로드 처리 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReindexKnowledge = async () => {
    const token = getAccessToken();
    if (!token) return;

    setReindexingKnowledge(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/knowledge/reindex", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ exam }),
      });
      const payload = (await res.json().catch(() => null)) as AdminKnowledgeReindexResponse | null;
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? "RAG 재색인에 실패했습니다.");
        return;
      }

      setMessage(
        payload.message ||
          `재색인 완료: 승인 지식 ${payload.approvedCount}개, 생성 청크 ${payload.chunkCount}개`
      );
    } catch {
      setMessage("RAG 재색인 중 오류가 발생했습니다.");
    } finally {
      setReindexingKnowledge(false);
    }
  };

  const handleEditPendingKnowledge = (
    id: string,
    field: "rawInput" | "question" | "answer" | "tags",
    value: string
  ) => {
    setKnowledgePending((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "tags") {
          return { ...item, tags: parseTagsInput(value) };
        }
        return { ...item, [field]: value };
      })
    );
  };

  const handleSavePendingKnowledge = async (item: KnowledgeItem) => {
    const token = getAccessToken();
    if (!token) return;

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam,
          id: item.id,
          status: "pending",
          rawInput: item.rawInput,
          question: item.question,
          answer: item.answer,
          tags: item.tags,
        }),
      });
      const payload = (await res.json().catch(() => null)) as AdminKnowledgeResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "초안 저장에 실패했습니다.");
        return;
      }
      setKnowledgePending(payload.pending ?? []);
      setKnowledgeApproved(payload.approved ?? []);
      setMessage("초안을 저장했습니다.");
    } catch {
      setMessage("초안 저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveKnowledge = async (item: KnowledgeItem) => {
    const token = getAccessToken();
    if (!token) return;

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam,
          id: item.id,
          status: "approved",
          rawInput: item.rawInput,
          question: item.question,
          answer: item.answer,
          tags: item.tags,
        }),
      });
      const payload = (await res.json().catch(() => null)) as AdminKnowledgeResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "승인 반영에 실패했습니다.");
        return;
      }
      setKnowledgePending(payload.pending ?? []);
      setKnowledgeApproved(payload.approved ?? []);
      setMessage("승인 반영 완료. 이제 AI 답변 지식으로 사용할 수 있습니다.");
    } catch {
      setMessage("승인 반영 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;

    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam,
          id,
        }),
      });
      const payload = (await res.json().catch(() => null)) as AdminKnowledgeResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setMessage((payload && "error" in payload && payload.error) || "AI 지식 삭제에 실패했습니다.");
        return;
      }
      setKnowledgePending(payload.pending ?? []);
      setKnowledgeApproved(payload.approved ?? []);
      setMessage("AI 지식을 삭제했습니다.");
    } catch {
      setMessage("AI 지식 삭제 중 오류가 발생했습니다.");
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
                    <div className="grid grid-cols-1 md:grid-cols-8 gap-2">
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
                        value={cutoffForm.track}
                        onChange={(e) =>
                          setCutoffForm((prev) => ({
                            ...prev,
                            track: e.target.value as CutoffTrackType,
                          }))
                        }
                      >
                        <option value="general">일반</option>
                        <option value="academic">학사</option>
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
                        placeholder={`추합권 컷 (${cutoffForm.inputBasis === "wrong" ? "개" : "점"})`}
                        inputMode="decimal"
                        value={cutoffForm.waitlistCutoff}
                        onChange={(e) =>
                          setCutoffForm((prev) => ({ ...prev, waitlistCutoff: e.target.value }))
                        }
                      />
                      <Input
                        placeholder={`최초합권 컷 (${cutoffForm.inputBasis === "wrong" ? "개" : "점"})`}
                        inputMode="decimal"
                        value={cutoffForm.initialCutoff}
                        onChange={(e) =>
                          setCutoffForm((prev) => ({ ...prev, initialCutoff: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="비고 (선택)"
                        value={cutoffForm.memo}
                        onChange={(e) =>
                          setCutoffForm((prev) => ({ ...prev, memo: e.target.value }))
                        }
                      />
                      <div className="md:col-span-8">
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
                                {item.year} · {item.university} {item.major} ({cutoffTrackLabel(item.track)})
                              </p>
                              <p className="text-xs text-primary mt-1">
                                추합권 {item.waitlistCutoff ?? "-"}
                                {item.inputBasis === "wrong" ? "개" : "점"} · 최초합권 {item.initialCutoff ?? "-"}
                                {item.inputBasis === "wrong" ? "개" : "점"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                기준: {item.inputBasis === "wrong" ? "틀린개수" : "점수"}
                              </p>
                              {item.memo ? (
                                <p className="text-xs text-muted-foreground mt-1">{item.memo}</p>
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

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">주요 일정 관리</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <Input
                        placeholder="일정 제목"
                        value={scheduleForm.title}
                        onChange={(e) =>
                          setScheduleForm((prev) => ({ ...prev, title: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="카테고리 (예: 원서접수)"
                        value={scheduleForm.category}
                        onChange={(e) =>
                          setScheduleForm((prev) => ({ ...prev, category: e.target.value }))
                        }
                      />
                      <Input
                        type="datetime-local"
                        value={scheduleForm.startsAt}
                        onChange={(e) =>
                          setScheduleForm((prev) => ({ ...prev, startsAt: e.target.value }))
                        }
                      />
                      <Input
                        type="datetime-local"
                        value={scheduleForm.endsAt}
                        onChange={(e) =>
                          setScheduleForm((prev) => ({ ...prev, endsAt: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="장소 (선택)"
                        value={scheduleForm.location}
                        onChange={(e) =>
                          setScheduleForm((prev) => ({ ...prev, location: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="주관 기관 (선택)"
                        value={scheduleForm.organizer}
                        onChange={(e) =>
                          setScheduleForm((prev) => ({ ...prev, organizer: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="공식 링크 URL (선택)"
                        value={scheduleForm.linkUrl}
                        onChange={(e) =>
                          setScheduleForm((prev) => ({ ...prev, linkUrl: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="메모 (선택)"
                        value={scheduleForm.note}
                        onChange={(e) =>
                          setScheduleForm((prev) => ({ ...prev, note: e.target.value }))
                        }
                      />
                      <div className="md:col-span-4">
                        <Button onClick={handleSaveSchedule} disabled={submitting}>
                          {submitting ? "저장 중..." : "주요 일정 저장"}
                        </Button>
                      </div>
                    </div>

                    {loadingSchedules ? (
                      <p className="text-sm text-muted-foreground">일정 목록 불러오는 중...</p>
                    ) : sortedSchedules.length ? (
                      <div className="space-y-2">
                        {sortedSchedules.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-border px-3 py-3 flex items-center justify-between gap-3"
                          >
                            <div>
                              <p className="text-sm font-semibold">
                                {item.title}
                              </p>
                              <p className="text-xs text-primary mt-1">
                                {item.category} · {formatDateLabel(item.startsAt)}
                                {item.endsAt ? ` ~ ${formatDateLabel(item.endsAt)}` : ""}
                              </p>
                              {item.location ? (
                                <p className="text-xs text-muted-foreground mt-1">장소: {item.location}</p>
                              ) : null}
                              {item.organizer ? (
                                <p className="text-xs text-muted-foreground">주관: {item.organizer}</p>
                              ) : null}
                              {item.linkUrl ? (
                                <a
                                  className="text-xs text-blue-600 underline"
                                  href={item.linkUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  공식 링크
                                </a>
                              ) : null}
                              {item.note ? (
                                <p className="text-xs text-muted-foreground mt-1">{item.note}</p>
                              ) : null}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleDeleteSchedule(item.id)}
                              disabled={submitting}
                            >
                              삭제
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        등록된 일정 데이터가 없습니다.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">최신뉴스 관리 (홈 상단 노출)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-2">
                      <Input
                        placeholder="뉴스 제목"
                        value={newsForm.title}
                        onChange={(e) =>
                          setNewsForm((prev) => ({ ...prev, title: e.target.value }))
                        }
                      />
                      <textarea
                        className="min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="뉴스 내용"
                        value={newsForm.content}
                        onChange={(e) =>
                          setNewsForm((prev) => ({ ...prev, content: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="관련 링크 (선택)"
                        value={newsForm.linkUrl}
                        onChange={(e) =>
                          setNewsForm((prev) => ({ ...prev, linkUrl: e.target.value }))
                        }
                      />
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">첨부 파일 (선택)</div>
                        <input
                          type="file"
                          onChange={(e) => {
                            const file = e.currentTarget.files?.[0] ?? null;
                            void handleUploadNewsAttachment(file);
                            e.currentTarget.value = "";
                          }}
                          disabled={submitting || uploadingNewsAttachment}
                        />
                        {uploadingNewsAttachment ? (
                          <p className="text-xs text-muted-foreground">첨부 파일 업로드 중...</p>
                        ) : null}
                        {newsAttachment ? (
                          <div className="flex items-center gap-2 text-xs">
                            <a
                              href={newsAttachment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline underline-offset-2"
                            >
                              {newsAttachment.filename}
                            </a>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setNewsAttachment(null)}
                              disabled={submitting}
                            >
                              제거
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={handleSaveNews} disabled={submitting}>
                            {submitting
                              ? (editingNewsId ? "수정 저장 중..." : "저장 중...")
                              : (editingNewsId ? "최신뉴스 수정 저장" : "최신뉴스 업로드")}
                          </Button>
                          {editingNewsId ? (
                            <Button
                              variant="outline"
                              onClick={handleCancelEditNews}
                              disabled={submitting}
                            >
                              수정 취소
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {loadingNews ? (
                      <p className="text-sm text-muted-foreground">최신뉴스 목록 불러오는 중...</p>
                    ) : sortedNews.length ? (
                      <div className="space-y-2">
                        {sortedNews.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-border px-3 py-3 flex items-center justify-between gap-3"
                          >
                            <div>
                              <p className="text-sm font-semibold">{item.title}</p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {item.content || "본문 없이 링크/첨부만 등록된 뉴스"}
                              </p>
                              {item.linkUrl ? (
                                <a
                                  href={item.linkUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary mt-1 inline-flex underline underline-offset-2"
                                >
                                  관련 링크 열기
                                </a>
                              ) : null}
                              {item.attachments?.length ? (
                                <div className="mt-1 space-y-1">
                                  {item.attachments.map((attachment) => (
                                    <a
                                      key={`${item.id}-${attachment.url}`}
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-primary inline-flex underline underline-offset-2"
                                    >
                                      첨부: {attachment.filename}
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                              <p className="text-xs text-primary mt-1">{formatDateLabel(item.createdAt)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStartEditNews(item)}
                                disabled={submitting}
                              >
                                수정
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleDeleteNews(item.id)}
                                disabled={submitting}
                              >
                                삭제
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        등록된 최신뉴스가 없습니다.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">정보넣기 탭 (RAG용 장문 입력)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      학교/학과/학년도 정보를 함께 넣으면 `pending` 초안으로 저장돼. 아래 AI 지식 검수에서 확인 후 승인하면 챗봇 RAG에 반영돼.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <Input
                        placeholder="학년도 (예: 2026)"
                        value={knowledgeInfoForm.admissionYear}
                        onChange={(e) =>
                          setKnowledgeInfoForm((prev) => ({ ...prev, admissionYear: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="학교명 (예: 성균관대학교)"
                        value={knowledgeInfoForm.university}
                        onChange={(e) =>
                          setKnowledgeInfoForm((prev) => ({ ...prev, university: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="학과/전형 (선택)"
                        value={knowledgeInfoForm.majorTrack}
                        onChange={(e) =>
                          setKnowledgeInfoForm((prev) => ({ ...prev, majorTrack: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="출처 메모 (선택)"
                        value={knowledgeInfoForm.sourceLabel}
                        onChange={(e) =>
                          setKnowledgeInfoForm((prev) => ({ ...prev, sourceLabel: e.target.value }))
                        }
                      />
                    </div>
                    <textarea
                      className="min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="예: 2026학년도 성균관대학교 편입학 주요 일정/전형 변경/경쟁률/예상 커트라인 정보를 여기에 그대로 붙여넣어 주세요."
                      value={knowledgeInfoForm.rawText}
                      onChange={(e) =>
                        setKnowledgeInfoForm((prev) => ({ ...prev, rawText: e.target.value }))
                      }
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        본문 길이: {knowledgeInfoForm.rawText.trim().length.toLocaleString()}자 (권장 12,000자 이하)
                      </p>
                      <Button onClick={handleCreateKnowledgeFromInfoTab} disabled={submitting}>
                        {submitting ? "처리 중..." : "정보 넣고 초안 생성"}
                      </Button>
                    </div>

                    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Q/A 본문을 한 번에 붙여넣어 pending 초안을 여러 개 생성합니다.
                        형식: `Q01. 질문` + `A01. 답변`
                      </p>
                      <textarea
                        className="min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder={"Q01. 질문\nA01. 답변\n\nQ02. 질문\nA02. 답변"}
                        value={knowledgeBulkRawInput}
                        onChange={(e) => setKnowledgeBulkRawInput(e.target.value)}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          본문 길이: {knowledgeBulkRawInput.trim().length.toLocaleString()}자
                        </p>
                        <Button onClick={handleCreateKnowledgeBulkQA} disabled={submitting}>
                          {submitting ? "처리 중..." : "Q/A 일괄 초안 생성"}
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        범용 본문 직투입: Q/A 형식이 아니어도 그대로 승인 반영 + 즉시 색인합니다.
                      </p>
                      <Input
                        placeholder="제목(선택) - 비워두면 본문 첫 줄로 자동 생성"
                        value={knowledgeDirectTitle}
                        onChange={(e) => setKnowledgeDirectTitle(e.target.value)}
                      />
                      <Input
                        placeholder="추가 태그(선택, 쉼표 구분)"
                        value={knowledgeDirectTags}
                        onChange={(e) => setKnowledgeDirectTags(e.target.value)}
                      />
                      <textarea
                        className="min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="RAG에 바로 반영할 본문을 그대로 붙여넣어 주세요."
                        value={knowledgeDirectInput}
                        onChange={(e) => setKnowledgeDirectInput(e.target.value)}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          본문 길이: {knowledgeDirectInput.trim().length.toLocaleString()}자
                        </p>
                        <Button onClick={handleDirectIngestKnowledge} disabled={submitting}>
                          {submitting ? "처리 중..." : "원문 바로 반영(승인+색인)"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">AI 지식 검수 (날것 입력 → 컨펌 후 반영)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => void loadKnowledge()}
                        disabled={loadingKnowledge || submitting}
                      >
                        {loadingKnowledge ? "불러오는 중..." : "지식 새로고침"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void loadUnansweredQuestions()}
                        disabled={loadingUnansweredQuestions || submitting}
                      >
                        {loadingUnansweredQuestions ? "집계 중..." : "미해결 질문 새로고침"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void loadSubmittedQuestions()}
                        disabled={loadingSubmittedQuestions || submitting}
                      >
                        {loadingSubmittedQuestions ? "불러오는 중..." : "질문하기 접수 새로고침"}
                      </Button>
                      <Button
                        onClick={() => void handleReindexKnowledge()}
                        disabled={reindexingKnowledge || submitting}
                      >
                        {reindexingKnowledge ? "재색인 중..." : "RAG 재색인 실행"}
                      </Button>
                    </div>

                    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        입력한 날것은 바로 반영되지 않고 `pending`으로 저장됩니다. 아래에서 내용을 확인 후 승인하세요.
                      </p>
                      <textarea
                        className="min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="날것 조언 입력 (예: 모의고사는 지표일 뿐이고 멘탈 흔들리지 말자...)"
                        value={knowledgeRawInput}
                        onChange={(e) => setKnowledgeRawInput(e.target.value)}
                      />
                      <div>
                        <Button onClick={handleCreateKnowledgeDraft} disabled={submitting}>
                          {submitting ? "처리 중..." : "초안 생성 (Pending)"}
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        PDF 파일을 업로드하면 `pending` 초안이 자동 생성됩니다. 검수 후 승인 반영하세요.
                      </p>
                      <input
                        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(event) => setKnowledgePdfFile(event.target.files?.[0] ?? null)}
                      />
                      <Input
                        placeholder="PDF 메모(선택)"
                        value={knowledgePdfNote}
                        onChange={(e) => setKnowledgePdfNote(e.target.value)}
                      />
                      <Input
                        placeholder="태그(선택, 쉼표 구분)"
                        value={knowledgePdfTags}
                        onChange={(e) => setKnowledgePdfTags(e.target.value)}
                      />
                      <div>
                        <Button onClick={handleUploadKnowledgePdf} disabled={submitting}>
                          {submitting ? "처리 중..." : "PDF 업로드 + 초안 생성"}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-semibold">
                        미해결 질문 수집 (Fallback) · 최근 로그 {fallbackLogCount}건 기준
                      </p>
                      {loadingUnansweredQuestions ? (
                        <p className="text-sm text-muted-foreground">미해결 질문 집계 중...</p>
                      ) : unansweredQuestions.length ? (
                        <div className="space-y-2">
                          {unansweredQuestions.slice(0, 20).map((item) => (
                            <div
                              key={item.normalizedQuestion}
                              className="rounded-lg border border-border p-3 flex items-start justify-between gap-3"
                            >
                              <p className="text-sm leading-6">{item.question}</p>
                              <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
                                <p>횟수: {item.count}</p>
                                <p>최근: {formatDateLabel(item.lastSeenAt)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">수집된 미해결 질문이 없습니다.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-semibold">
                        질문하기 접수 목록 · 최근 {submittedQuestions.length}건
                      </p>
                      {loadingSubmittedQuestions ? (
                        <p className="text-sm text-muted-foreground">질문하기 접수 목록 불러오는 중...</p>
                      ) : submittedQuestions.length ? (
                        <div className="space-y-2">
                          {submittedQuestions.slice(0, 30).map((item) => (
                            <div
                              key={item.id}
                              className="rounded-lg border border-border p-3 flex items-start justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <p className="text-sm leading-6">{item.question}</p>
                                <p className="text-xs text-muted-foreground">
                                  이메일: {item.userEmail || "-"}
                                </p>
                              </div>
                              <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
                                <p>{formatDateLabel(item.createdAt)}</p>
                                {item.traceId ? <p>trace: {item.traceId.slice(0, 8)}</p> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">접수된 질문이 없습니다.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-semibold">검수 대기</p>
                      {loadingKnowledge ? (
                        <p className="text-sm text-muted-foreground">AI 지식 불러오는 중...</p>
                      ) : knowledgePending.length ? (
                        knowledgePending.map((item) => (
                          <div key={item.id} className="rounded-lg border border-border p-3 space-y-2">
                            <div className="text-xs text-muted-foreground">
                              생성일: {formatDateLabel(item.createdAt)}
                            </div>
                            <textarea
                              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              placeholder="원문(날것)"
                              value={item.rawInput}
                              onChange={(e) =>
                                handleEditPendingKnowledge(item.id, "rawInput", e.target.value)
                              }
                            />
                            <Input
                              placeholder="질문(사용자 질문 형태)"
                              value={item.question}
                              onChange={(e) =>
                                handleEditPendingKnowledge(item.id, "question", e.target.value)
                              }
                            />
                            <textarea
                              className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              placeholder="답변(실제 AI가 참고할 내용)"
                              value={item.answer}
                              onChange={(e) =>
                                handleEditPendingKnowledge(item.id, "answer", e.target.value)
                              }
                            />
                            <Input
                              placeholder="태그 (쉼표로 구분)"
                              value={item.tags.join(", ")}
                              onChange={(e) =>
                                handleEditPendingKnowledge(item.id, "tags", e.target.value)
                              }
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={submitting}
                                onClick={() => void handleSavePendingKnowledge(item)}
                              >
                                초안 저장
                              </Button>
                              <Button
                                size="sm"
                                disabled={submitting}
                                onClick={() => void handleApproveKnowledge(item)}
                              >
                                승인 반영
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={submitting}
                                onClick={() => void handleDeleteKnowledge(item.id)}
                              >
                                삭제
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">검수 대기 중인 지식이 없습니다.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-semibold">승인 완료</p>
                      {sortedKnowledgeApproved.length ? (
                        <div className="space-y-2">
                          {sortedKnowledgeApproved.slice(0, 30).map((item) => (
                            <div
                              key={item.id}
                              className="rounded-lg border border-border px-3 py-3 flex items-start justify-between gap-3"
                            >
                              <div>
                                <p className="text-sm font-semibold">{item.question || "(질문 미입력)"}</p>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.answer}</p>
                                <p className="text-xs text-primary mt-1">
                                  승인일: {formatDateLabel(item.approvedAt || item.updatedAt)}
                                </p>
                                {item.tags.length ? (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    태그: {item.tags.join(", ")}
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={submitting}
                                onClick={() => void handleDeleteKnowledge(item.id)}
                              >
                                삭제
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">승인된 AI 지식이 아직 없습니다.</p>
                      )}
                    </div>
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
