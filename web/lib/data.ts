export type ExamCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
};

export const EXAM_CATEGORIES: ExamCategory[] = [
  {
    id: "1",
    name: "편입",
    slug: "transfer",
    icon: "GraduationCap",
    description: "합격 가능성 예측, 커트라인, 전략형 Q&A",
  },
  {
    id: "2",
    name: "CPA (회계사)",
    slug: "cpa",
    icon: "Calculator",
    description: "검증된 답변과 전문 수험 정보",
  },
];

export type CommunityBoard = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

export type CommunityBoardGroup = {
  id: string;
  examName: string;
  examSlug: string;
  description: string;
  boards: CommunityBoard[];
};

export const COMMUNITY_BOARD_GROUPS: CommunityBoardGroup[] = [
  {
    id: "cg-transfer",
    examName: "편입",
    examSlug: "transfer",
    description: "합격 확률과 전략을 중심으로 소통하는 편입 특화 커뮤니티",
    boards: [
      {
        id: "transfer-qa",
        name: "전략 Q&A",
        slug: "qa",
        description: "대학/전형/학습 전략 질문과 답변",
      },
      {
        id: "transfer-study-qa",
        name: "학습 Q&A",
        slug: "study-qa",
        description: "영어/수학/논술 과목별 공부법 질문과 답변",
      },
      {
        id: "transfer-cutoff",
        name: "커트라인 제보",
        slug: "cutoff",
        description: "대학별 합격 점수 제보와 비교",
      },
      {
        id: "transfer-free",
        name: "자유게시판",
        slug: "free",
        description: "수험생 일상/멘탈/루틴 공유",
      },
      {
        id: "transfer-admit",
        name: "합격수기",
        slug: "admit-review",
        description: "합격생 인증 기반 수기와 노하우",
      },
    ],
  },
  {
    id: "cg-cpa",
    examName: "CPA (회계사)",
    examSlug: "cpa",
    description: "검증된 합격자/현직 인증 답변과 과목별 고밀도 정보",
    boards: [
      {
        id: "cpa-qa",
        name: "전문 Q&A",
        slug: "qa",
        description: "재무회계/세법/원가관리 전략 질의응답",
      },
      {
        id: "cpa-free",
        name: "자유게시판",
        slug: "free",
        description: "학습 루틴/슬럼프/시험장 정보",
      },
      {
        id: "cpa-materials",
        name: "자료/강사",
        slug: "resources",
        description: "강의 추록, 교재, 자료 공유",
      },
      {
        id: "cpa-pass",
        name: "합격자 라운지",
        slug: "pass-lounge",
        description: "1차 합격/현직 회계사 인증 유저 중심 토론",
      },
    ],
  },
];

export type BoardPost = {
  id: string;
  title: string;
  author: string;
  comments: number;
  views: number;
  time: string;
};

export type BoardPostGroup = {
  examSlug: string;
  boardSlug: string;
  boardName: string;
  posts: BoardPost[];
};

export const BOARD_POST_GROUPS: BoardPostGroup[] = [
  {
    examSlug: "transfer",
    boardSlug: "qa",
    boardName: "전략 Q&A",
    posts: [
      {
        id: "transfer-qa-1",
        title: "건국대 경영 편입 커트라인 88점이면 지원 가능할까요?",
        author: "편입N수",
        comments: 15,
        views: 361,
        time: "19분 전",
      },
      {
        id: "transfer-qa-2",
        title: "전적대 3.4 / 공인영어 940 조합, 인서울 상위권 전략 부탁드립니다",
        author: "리셋중",
        comments: 12,
        views: 288,
        time: "42분 전",
      },
    ],
  },
  {
    examSlug: "transfer",
    boardSlug: "study-qa",
    boardName: "학습 Q&A",
    posts: [
      {
        id: "transfer-study-qa-1",
        title: "편입영어 독해 정확도 올리는 복습 루틴 피드백 부탁해요",
        author: "리딩중",
        comments: 13,
        views: 244,
        time: "27분 전",
      },
      {
        id: "transfer-study-qa-2",
        title: "수학 미적분 킬러문항 접근 순서 어떻게 잡으세요?",
        author: "수학재도전",
        comments: 9,
        views: 198,
        time: "1시간 전",
      },
    ],
  },
  {
    examSlug: "transfer",
    boardSlug: "cutoff",
    boardName: "커트라인 제보",
    posts: [
      {
        id: "transfer-cutoff-1",
        title: "2025 중앙대 전전(일반) 최종합격 91.3 공유",
        author: "합격생A",
        comments: 9,
        views: 410,
        time: "31분 전",
      },
      {
        id: "transfer-cutoff-2",
        title: "한양대 기계 컷 89 후반대였던 것 같습니다",
        author: "작년응시",
        comments: 7,
        views: 256,
        time: "1시간 전",
      },
    ],
  },
  {
    examSlug: "transfer",
    boardSlug: "free",
    boardName: "자유게시판",
    posts: [
      {
        id: "transfer-free-1",
        title: "이번 주 모의고사 멘탈 관리 어떻게 하시나요",
        author: "새벽러",
        comments: 11,
        views: 176,
        time: "16분 전",
      },
      {
        id: "transfer-free-2",
        title: "편입 영어 단어 회독표 템플릿 공유합니다",
        author: "꾸준함",
        comments: 4,
        views: 98,
        time: "54분 전",
      },
    ],
  },
  {
    examSlug: "cpa",
    boardSlug: "qa",
    boardName: "전문 Q&A",
    posts: [
      {
        id: "cpa-qa-1",
        title: "1차 세법개론 70점대에서 80점대로 올린 루틴 피드백 부탁",
        author: "초시회계",
        comments: 18,
        views: 349,
        time: "24분 전",
      },
      {
        id: "cpa-qa-2",
        title: "원가관리회계 계산속도 안 나올 때 우선순위가 뭘까요",
        author: "분개러",
        comments: 10,
        views: 211,
        time: "53분 전",
      },
    ],
  },
  {
    examSlug: "cpa",
    boardSlug: "free",
    boardName: "자유게시판",
    posts: [
      {
        id: "cpa-free-1",
        title: "동차생 하루 루틴 점검해 주세요",
        author: "회계랑",
        comments: 9,
        views: 139,
        time: "22분 전",
      },
      {
        id: "cpa-free-2",
        title: "시험장 도시락 뭐가 제일 무난했나요",
        author: "출근길",
        comments: 6,
        views: 102,
        time: "1시간 전",
      },
    ],
  },
  {
    examSlug: "cpa",
    boardSlug: "resources",
    boardName: "자료/강사",
    posts: [
      {
        id: "cpa-res-1",
        title: "재무회계 2026 개정 추록 요약 업로드",
        author: "기출광",
        comments: 14,
        views: 402,
        time: "12분 전",
      },
      {
        id: "cpa-res-2",
        title: "감사 과목 판서노트 정리 방식 공유",
        author: "노트장인",
        comments: 8,
        views: 220,
        time: "39분 전",
      },
    ],
  },
];

export type CutoffSeed = {
  id: string;
  examSlug: string;
  university: string;
  major: string;
  year: number;
  scoreBand: string;
  note: string;
};

export const CUTOFF_SEED_DATA: CutoffSeed[] = [
  {
    id: "cutoff-1",
    examSlug: "transfer",
    university: "중앙대학교",
    major: "전자전기공학부",
    year: 2025,
    scoreBand: "90.8 ~ 92.1",
    note: "일반편입 기준, 면접 반영 포함",
  },
  {
    id: "cutoff-2",
    examSlug: "transfer",
    university: "건국대학교",
    major: "경영학과",
    year: 2025,
    scoreBand: "87.5 ~ 89.2",
    note: "전적대 성적/영어 가중치 반영",
  },
  {
    id: "cutoff-3",
    examSlug: "transfer",
    university: "한양대학교",
    major: "기계공학부",
    year: 2024,
    scoreBand: "88.7 ~ 90.0",
    note: "최초/추합 데이터 통합",
  },
  {
    id: "cutoff-4",
    examSlug: "transfer",
    university: "서강대학교",
    major: "경제학부",
    year: 2025,
    scoreBand: "91.2 ~ 92.8",
    note: "합격수기 언급 + 인증 데이터 교차 검증",
  },
];

export type InstructorRankingSeed = {
  id: string;
  examSlug: string;
  subject: string;
  instructorName: string;
  rank: number;
  trend: string;
  confidence: number;
};

export const INSTRUCTOR_RANKING_SEED: InstructorRankingSeed[] = [
  {
    id: "rank-transfer-1",
    examSlug: "transfer",
    subject: "편입영어",
    instructorName: "김OO",
    rank: 1,
    trend: "+3",
    confidence: 92,
  },
  {
    id: "rank-transfer-2",
    examSlug: "transfer",
    subject: "수학",
    instructorName: "박OO",
    rank: 2,
    trend: "-",
    confidence: 88,
  },
  {
    id: "rank-transfer-3",
    examSlug: "transfer",
    subject: "전공",
    instructorName: "이OO",
    rank: 3,
    trend: "+1",
    confidence: 81,
  },
  {
    id: "rank-cpa-1",
    examSlug: "cpa",
    subject: "재무회계",
    instructorName: "정OO",
    rank: 1,
    trend: "+2",
    confidence: 95,
  },
  {
    id: "rank-cpa-2",
    examSlug: "cpa",
    subject: "세법",
    instructorName: "최OO",
    rank: 2,
    trend: "-",
    confidence: 89,
  },
  {
    id: "rank-cpa-3",
    examSlug: "cpa",
    subject: "원가관리",
    instructorName: "윤OO",
    rank: 3,
    trend: "+1",
    confidence: 84,
  },
];

export type DailyBriefingSeed = {
  id: string;
  examSlug: string;
  title: string;
  summary: string;
  sourceLabel: string;
  publishedAt: string;
};

export const DAILY_BRIEFING_SEED: DailyBriefingSeed[] = [
  {
    id: "brief-transfer-1",
    examSlug: "transfer",
    title: "중앙대 2026 편입 요강 일부 변경",
    summary: "면접 반영 비율이 전년 대비 5%p 상향. 1단계 커트라인 예측치는 소폭 상승 가능성.",
    sourceLabel: "대학 입학처 공지",
    publishedAt: "2026-02-10",
  },
  {
    id: "brief-transfer-2",
    examSlug: "transfer",
    title: "주요 편입 학원 2월 모의고사 일정 공개",
    summary: "상위권 대학 타깃 모의고사 일정이 집중 배치되어 있어 실전 점검 주간으로 활용 권장.",
    sourceLabel: "학원 공지 모음",
    publishedAt: "2026-02-11",
  },
  {
    id: "brief-cpa-1",
    examSlug: "cpa",
    title: "금감원 공지: 2026 1차 시험 유의사항 업데이트",
    summary: "신분증 인정 범위와 입실 제한 시간 안내가 명확화. 시험장 반입 규정 반드시 재확인 필요.",
    sourceLabel: "금융감독원",
    publishedAt: "2026-02-11",
  },
  {
    id: "brief-cpa-2",
    examSlug: "cpa",
    title: "주요 강의 플랫폼 추록 배포 현황",
    summary: "재무회계/세법 추록 배포가 시작되어 최신 기준 반영 여부를 주간 단위로 체크 권장.",
    sourceLabel: "강의 플랫폼 공지",
    publishedAt: "2026-02-10",
  },
];

export type RewardRule = {
  id: string;
  label: string;
  points: number;
  description: string;
};

export const REWARD_RULES: RewardRule[] = [
  {
    id: "reward-adopted",
    label: "채택 답변",
    points: 80,
    description: "질문자가 채택한 답변자에게 지급",
  },
  {
    id: "reward-verified-bonus",
    label: "인증 유저 가산",
    points: 20,
    description: "합격자/회계사 인증 유저가 채택될 때 추가",
  },
  {
    id: "reward-quality-post",
    label: "핵심 정보글",
    points: 30,
    description: "운영자가 유익 게시글로 선정 시 지급",
  },
];
