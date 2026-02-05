export type ExamCategory = {
    id: string;
    name: string;
    slug: string;
    icon: string;
    description: string;
};

export const EXAM_CATEGORIES: ExamCategory[] = [
    { id: '1', name: 'CPA (회계사)', slug: 'cpa', icon: 'Calculator', description: '공인회계사 시험 정보 및 커뮤니티' },
    { id: '2', name: 'CTA (세무사)', slug: 'cta', icon: 'BookOpen', description: '세무사 시험 대비 및 합격 수기' },
    { id: '3', name: '9급 공무원', slug: 'civil-9', icon: 'Building2', description: '국가직/지방직 9급 공무원 준비' },
    { id: '4', name: '7급 공무원', slug: 'civil-7', icon: 'Landmark', description: '7급 공무원 시험 정보 공유' },
    { id: '5', name: '변호사 (로스쿨)', slug: 'lawyer', icon: 'Scale', description: '변호사 시험 및 로스쿨 생활' },
    { id: '6', name: '노무사', slug: 'labor', icon: 'Users', description: '공인노무사 시험 합격 정보' },
    { id: '7', name: '감정평가사', slug: 'appraiser', icon: 'Home', description: '감정평가사 시험/실무 이야기' },
    { id: '8', name: '경찰공무원', slug: 'police', icon: 'Siren', description: '경찰 공무원 채용 및 체력 정보' },
    { id: '9', name: '소방공무원', slug: 'fire', icon: 'Flame', description: '소방 공무원 시험 및 안전' },
    { id: '10', name: '변리사', slug: 'patent', icon: 'Lightbulb', description: '변리사 1차/2차 시험 정보' },
];

export type TrendingPost = {
    id: string;
    title: string;
    board: string;
    exam: string;
    comments: number;
    views: number;
    delta: number;
    time: string;
};

export const TRENDING_POSTS: TrendingPost[] = [
    { id: "t1", title: "CPA 1차 공부 루틴 공유합니다 (회독표 포함)", board: "자유", exam: "CPA", comments: 38, views: 1520, delta: 21, time: "11분 전" },
    { id: "t2", title: "9급 국어 문학 고난도 정리본 업로드", board: "자료실", exam: "9급 공무원", comments: 19, views: 860, delta: 15, time: "25분 전" },
    { id: "t4", title: "변리사 1차 기출 오답 노트 템플릿", board: "Q&A", exam: "변리사", comments: 27, views: 540, delta: 9, time: "48분 전" },
    { id: "t5", title: "7급 경제학 모의고사 난이도 체감 공유", board: "자유", exam: "7급 공무원", comments: 9, views: 420, delta: 7, time: "58분 전" },
];

export const HOT_KEYWORDS = [
    "전공자 vs 비전공자",
    "회독 루틴",
    "기출 3회독",
    "모의고사 난이도",
    "답안지 템플릿",
];

export type BestComment = {
    id: string;
    postTitle: string;
    author: string;
    content: string;
    likes: number;
    time: string;
};

export const BEST_COMMENTS: BestComment[] = [
    { id: "c1", postTitle: "CPA 1차 과목별 난이도", author: "그루터기", content: "저는 회계학은 1.5배 시간 잡았어요. 나머지는 기출 반복이 답입니다.", likes: 42, time: "1시간 전" },
    { id: "c2", postTitle: "9급 영어 단어장 추천", author: "하루한장", content: "기출 단어장 + 오답복습만 해도 점수 안정됩니다.", likes: 31, time: "2시간 전" },
];

export type TopBoard = {
    id: string;
    name: string;
    exam: string;
    posts: number;
    activity: string;
};

export const TOP_BOARDS: TopBoard[] = [
    { id: "b1", name: "자유게시판", exam: "CPA", posts: 128, activity: "지금 32명 보는 중" },
    { id: "b2", name: "Q&A", exam: "9급 공무원", posts: 94, activity: "최근 10분 내 7건" },
    { id: "b3", name: "자료실", exam: "노무사", posts: 61, activity: "오늘 업로드 14건" },
];

export type CommunityBoard = {
    id: string;
    name: string;
    slug: string;
    description: string;
    postsToday: number;
    activeNow: number;
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
        id: "cg1",
        examName: "CPA (회계사)",
        examSlug: "cpa",
        description: "회계사 1·2차 과목별 정보를 한곳에.",
        boards: [
            { id: "cpa-1", name: "자유게시판", slug: "free", description: "수험생 일상과 고민 공유", postsToday: 42, activeNow: 18 },
            { id: "cpa-2", name: "자료실", slug: "resources", description: "요약본/서브노트/기출 정리", postsToday: 27, activeNow: 9 },
            { id: "cpa-3", name: "Q&A", slug: "qa", description: "과목별 질문 답변", postsToday: 31, activeNow: 14 },
        ],
    },
    {
        id: "cg2",
        examName: "9급 공무원",
        examSlug: "civil-9",
        description: "국가직/지방직 최신 정보와 필수 자료 모음.",
        boards: [
            { id: "c9-1", name: "자유게시판", slug: "free", description: "수험 생활 정보 공유", postsToday: 35, activeNow: 16 },
            { id: "c9-2", name: "기출/자료", slug: "resources", description: "기출 분석/암기노트", postsToday: 22, activeNow: 11 },
            { id: "c9-3", name: "Q&A", slug: "qa", description: "과목별 질문과 답변", postsToday: 28, activeNow: 13 },
        ],
    },
    {
        id: "cg3",
        examName: "노무사",
        examSlug: "labor",
        description: "노무사 1·2차 대비, 답안 구조 및 실무 팁.",
        boards: [
            { id: "labor-1", name: "자유게시판", slug: "free", description: "학습 일정과 고민 공유", postsToday: 14, activeNow: 7 },
            { id: "labor-2", name: "자료실", slug: "resources", description: "판례/법령 요약", postsToday: 9, activeNow: 3 },
            { id: "labor-3", name: "Q&A", slug: "qa", description: "답안 작성 피드백", postsToday: 11, activeNow: 6 },
        ],
    },
    {
        id: "cg4",
        examName: "변리사",
        examSlug: "patent",
        description: "특허법·민법 중심 학습 자료 모음.",
        boards: [
            { id: "pat-1", name: "자유게시판", slug: "free", description: "수험 생활/멘탈 관리", postsToday: 12, activeNow: 5 },
            { id: "pat-2", name: "기출/자료", slug: "resources", description: "조문 정리/핵심 판례", postsToday: 10, activeNow: 4 },
            { id: "pat-3", name: "Q&A", slug: "qa", description: "문제풀이 질문", postsToday: 8, activeNow: 4 },
        ],
    },
];

export type BoardFeedPost = {
    id: string;
    title: string;
    comments: number;
    time: string;
};

export type BoardFeed = {
    id: string;
    exam: string;
    board: string;
    posts: BoardFeedPost[];
};

export const BOARD_FEEDS: BoardFeed[] = [
    {
        id: "feed-1",
        exam: "CPA",
        board: "자유게시판",
        posts: [
            { id: "f1-1", title: "올해 1차 회독 루틴 공유합니다", comments: 18, time: "8분 전" },
            { id: "f1-2", title: "회계학 원가 파트 정리 팁", comments: 11, time: "22분 전" },
        ],
    },
    {
        id: "feed-2",
        exam: "9급 공무원",
        board: "자유게시판",
        posts: [
            { id: "f2-1", title: "국어 문학 고난도 풀이 질문", comments: 9, time: "12분 전" },
            { id: "f2-2", title: "영어 문법 우선순위 어떻게?", comments: 14, time: "26분 전" },
            { id: "f2-3", title: "한국사 연표 암기법 추천", comments: 7, time: "41분 전" },
        ],
    },
    {
        id: "feed-3",
        exam: "노무사",
        board: "자유게시판",
        posts: [
            { id: "f3-1", title: "노동법 판례 요약본 공유", comments: 5, time: "18분 전" },
            { id: "f3-2", title: "행정쟁송법 핵심정리 PDF", comments: 3, time: "32분 전" },
            { id: "f3-3", title: "2차 답안 구조 샘플", comments: 8, time: "45분 전" },
        ],
    },
    {
        id: "feed-4",
        exam: "변리사",
        board: "자유게시판",
        posts: [
            { id: "f4-1", title: "1차 합격 루틴과 공부 시간표", comments: 12, time: "29분 전" },
            { id: "f4-2", title: "특허법 점수 끌어올린 방법", comments: 4, time: "54분 전" },
            { id: "f4-3", title: "2차 모의고사 활용법", comments: 2, time: "1시간 전" },
        ],
    },
    {
        id: "feed-5",
        exam: "7급 공무원",
        board: "자유게시판",
        posts: [
            { id: "f5-1", title: "경제학 공부 루틴 조언", comments: 10, time: "17분 전" },
            { id: "f5-2", title: "헌법 모의고사 난이도 체감", comments: 6, time: "38분 전" },
        ],
    },
    {
        id: "feed-6",
        exam: "세무사",
        board: "자유게시판",
        posts: [
            { id: "f6-1", title: "세법개론 중요 조문 정리", comments: 7, time: "24분 전" },
            { id: "f6-2", title: "회계학 계산 문제 풀이집", comments: 5, time: "39분 전" },
            { id: "f6-3", title: "1차 기출 오답노트 공유", comments: 3, time: "1시간 전" },
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
        examSlug: "cpa",
        boardSlug: "free",
        boardName: "자유게시판",
        posts: [
            { id: "cpa-f-1", title: "1차 회독표 공유합니다", author: "회독러", comments: 12, views: 420, time: "10분 전" },
            { id: "cpa-f-2", title: "재무회계 공부 루틴 질문", author: "새내기", comments: 6, views: 210, time: "24분 전" },
        ],
    },
    {
        examSlug: "civil-9",
        boardSlug: "free",
        boardName: "자유게시판",
        posts: [
            { id: "c9-f-1", title: "국어 문학 파트 난이도 체감", author: "달빛", comments: 8, views: 180, time: "18분 전" },
            { id: "c9-f-2", title: "한국사 연표 암기법 공유", author: "초시생", comments: 5, views: 140, time: "33분 전" },
            { id: "c9-f-3", title: "영어 어휘 공부 어떻게 해요?", author: "하루10분", comments: 7, views: 200, time: "1시간 전" },
        ],
    },
    {
        examSlug: "labor",
        boardSlug: "free",
        boardName: "자유게시판",
        posts: [
            { id: "labor-f-1", title: "노동법 판례 정리 루틴", author: "로디", comments: 4, views: 120, time: "26분 전" },
            { id: "labor-f-2", title: "2차 답안 작성 팁 공유", author: "모범답안", comments: 6, views: 150, time: "50분 전" },
        ],
    },
    {
        examSlug: "patent",
        boardSlug: "free",
        boardName: "자유게시판",
        posts: [
            { id: "pat-f-1", title: "민법 암기 방법 공유", author: "봄날", comments: 5, views: 110, time: "22분 전" },
            { id: "pat-f-3", title: "1차 대비 자료 추천", author: "수험생A", comments: 4, views: 100, time: "1시간 전" },
        ],
    },
    {
        examSlug: "civil-7",
        boardSlug: "free",
        boardName: "자유게시판",
        posts: [
            { id: "c7-f-1", title: "경제학 풀이 루틴 공유", author: "경제러", comments: 7, views: 170, time: "14분 전" },
            { id: "c7-f-2", title: "헌법 개념 정리 방법", author: "헌법러", comments: 4, views: 120, time: "37분 전" },
        ],
    },
    {
        examSlug: "cta",
        boardSlug: "free",
        boardName: "자유게시판",
        posts: [
            { id: "cta-f-1", title: "세법개론 공부 팁", author: "세무러", comments: 6, views: 160, time: "12분 전" },
            { id: "cta-f-2", title: "회계학 계산 문제 접근법", author: "장부", comments: 3, views: 90, time: "28분 전" },
        ],
    },
];
