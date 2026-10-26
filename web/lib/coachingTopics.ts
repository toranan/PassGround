// 운영자 상담 방침을 주제별로 등록한다. 질문(또는 직전 사용자 질문)이 주제에 해당하면
// 해당 방침을 코칭 답변 프롬프트에 넣고, 라우팅에서도 코칭 상담으로 분류한다.
import { buildCutoffGuide, isCutoffQuestion } from "@/lib/cutoffCoaching";
import { buildGpaGuide, isGpaQuestion } from "@/lib/gpaCoaching";
import { buildStartTimingGuide, isStartTimingQuestion } from "@/lib/startTimingCoaching";

type HistoryMessage = { role: "user" | "assistant"; text: string };

type CoachingTopic = {
  id: string;
  matches: (question: string) => boolean;
  guide: (now: Date) => string;
};

const COACHING_TOPICS: CoachingTopic[] = [
  { id: "start_timing", matches: isStartTimingQuestion, guide: buildStartTimingGuide },
  { id: "gpa", matches: isGpaQuestion, guide: buildGpaGuide },
  { id: "cutoff", matches: isCutoffQuestion, guide: buildCutoffGuide },
];

export function matchCoachingTopics(question: string, history: HistoryMessage[] = []): string[] {
  const recentUserQuestions = history.slice(-4).filter((message) => message.role === "user").map((message) => message.text);
  return COACHING_TOPICS
    .filter((topic) => topic.matches(question) || recentUserQuestions.some((text) => topic.matches(text)))
    .map((topic) => topic.id);
}

export function isCoachingTopicQuestion(question: string): boolean {
  return COACHING_TOPICS.some((topic) => topic.matches(question));
}

export function buildCoachingTopicGuides(topicIds: string[], now = new Date()): string {
  return COACHING_TOPICS
    .filter((topic) => topicIds.includes(topic.id))
    .map((topic) => topic.guide(now))
    .join("\n\n");
}
