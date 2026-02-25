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
    description: "합격 가능성 예측, 커트라인, 학습법공유/학습질문 커뮤니티",
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
        id: "transfer-free",
        name: "자유게시판",
        slug: "free",
        description: "수험생 일상/멘탈/루틴 공유",
      },
      {
        id: "transfer-qa",
        name: "학습법공유",
        slug: "qa",
        description: "대학/전형/학습 전략 질문과 답변",
      },
      {
        id: "transfer-study-qa",
        name: "학습질문",
        slug: "study-qa",
        description: "영어/수학/논술 과목별 공부법 질문과 답변",
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
        id: "cpa-free",
        name: "자유게시판",
        slug: "free",
        description: "학습 루틴/슬럼프/시험장 정보",
      },
      {
        id: "cpa-qa",
        name: "전문 Q&A",
        slug: "qa",
        description: "재무회계/세법/원가관리 전략 질의응답",
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
    boardName: "학습법공유",
    posts: [
      {
        id: "transfer-qa-1",
        title: "건동홍 상경 편입, 진짜 베이스 없으면 1년 컷 불가능한가요? 냉정하게 좀",
        author: "고민중인재수생",
        comments: 42,
        views: 1250,
        time: "12분 전",
      },
      {
        id: "transfer-qa-2",
        title: "편입영어 단어장 보카바이블 vs MD 추천좀 (현실적인 조언 부탁)",
        author: "단어지옥",
        comments: 28,
        views: 890,
        time: "45분 전",
      },
      {
        id: "transfer-qa-3",
        title: "전적대 학점 3.2인데 서성한 지필로 극복 가능 범위인가요 ㅠㅠ",
        author: "학점세탁성공기원",
        comments: 56,
        views: 2100,
        time: "1시간 전",
      }
    ],
  },
  {
    examSlug: "transfer",
    boardSlug: "study-qa",
    boardName: "학습질문",
    posts: [
      {
        id: "transfer-study-qa-1",
        title: "편입수학 선형대수학 벡터공간 개념 이해 안가는데 정상임? ㅠㅠ",
        author: "수포자살려",
        comments: 31,
        views: 1540,
        time: "5분 전",
      },
      {
        id: "transfer-study-qa-2",
        title: "편머리 문법 꼭 풀어야 하나요? 기출만 돌리는 중인데 불안해서요",
        author: "문법과목포기",
        comments: 19,
        views: 882,
        time: "2시간 전",
      },
      {
        id: "transfer-study-qa-3",
        title: "독해 지문 읽을 때 구조분석부터 하시나요 쭉 읽으시나요?",
        author: "감으로푸는러",
        comments: 44,
        views: 1102,
        time: "3시간 전",
      }
    ],
  },
  {
    examSlug: "transfer",
    boardSlug: "free",
    boardName: "자유게시판",
    posts: [
      {
        id: "transfer-free-1",
        title: "와 오늘 도서관에 빌런 진짜 역대급이네 ㅋㅋㅋㅋ",
        author: "아아메충전",
        comments: 89,
        views: 3200,
        time: "방금 전",
      },
      {
        id: "transfer-free-2",
        title: "편준생 연애... 솔직히 외로워서 미칠 것 같은데 조언 좀",
        author: "멘탈박살",
        comments: 120,
        views: 5400,
        time: "10분 전",
      },
      {
        id: "transfer-free-3",
        title: "학원 강사님 너무 잘생겨서 집중이 안되는데 어캄;;",
        author: "주접대마왕",
        comments: 45,
        views: 2800,
        time: "30분 전",
      },
      {
        id: "transfer-free-4",
        title: "다들 하루 순공 시간 몇 시간 정점 찍으셨나여",
        author: "열품타중독",
        comments: 67,
        views: 1950,
        time: "2시간 전",
      }
    ],
  },
  {
    examSlug: "cpa",
    boardSlug: "qa",
    boardName: "전문 Q&A",
    posts: [
      {
        id: "cpa-qa-1",
        title: "객관식 재무회계 김기동 vs 김재호 (초시생 기준)",
        author: "회동이",
        comments: 38,
        views: 1400,
        time: "15분 전",
      },
      {
        id: "cpa-qa-2",
        title: "세무회계 2차 유예생 공부 계획 피드백 부탁드립니다",
        author: "유예합격가즈아",
        comments: 22,
        views: 950,
        time: "1시간 전",
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
        title: "오늘 금감원 발표 본 사람? 1차 컷 몇 점 예상함?",
        author: "컷예측기",
        comments: 210,
        views: 8900,
        time: "방금 전",
      },
      {
        id: "cpa-free-2",
        title: "주말 모의고사 치고 멘탈 터져서 치맥 달리는 중 ㅠ",
        author: "회떨이",
        comments: 55,
        views: 2100,
        time: "3시간 전",
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
        title: "25년 대비 상법 빈출 조문 pdf 요약본 공유합니다",
        author: "천사회시생",
        comments: 180,
        views: 4500,
        time: "어제",
      },
      {
        id: "cpa-res-2",
        title: "원가관리 임세진 쌤 서브노트 제본 퀄리티 어떤가요",
        author: "필기러",
        comments: 12,
        views: 800,
        time: "2일 전",
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
