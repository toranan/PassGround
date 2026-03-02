import Foundation

enum ExamSlug: String, CaseIterable, Codable, Identifiable {
    case transfer

    var id: String { rawValue }
    var title: String {
        switch self {
        case .transfer: return "편입"
        }
    }
}

struct APIErrorResponse: Codable, Error {
    let error: String
}

struct SessionUser: Codable {
    let id: String
    let email: String
    let username: String
    let nickname: String
    let targetUniversity: String?

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case username
        case nickname
        case targetUniversity
    }

    init(id: String, email: String, username: String, nickname: String, targetUniversity: String? = nil) {
        self.id = id
        self.email = email
        self.username = username
        self.nickname = nickname
        self.targetUniversity = targetUniversity
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        username = try container.decode(String.self, forKey: .username)
        nickname = try container.decode(String.self, forKey: .nickname)
        email = try container.decodeIfPresent(String.self, forKey: .email) ?? ""
        targetUniversity = try container.decodeIfPresent(String.self, forKey: .targetUniversity)
    }
}

struct SessionTokens: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Int?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresAt = "expires_at"
    }
}

struct OAuthExchangeResponse: Codable {
    let ok: Bool
    let user: SessionUser
    let session: SessionTokens
}

struct ExamInfo: Codable {
    let slug: String
    let name: String
    let description: String?
}

struct BoardInfo: Codable, Identifiable {
    let id: String
    let slug: String
    let name: String
    let description: String
    let preview: [BoardPreview]
}

struct BoardPreview: Codable, Identifiable {
    let id: String
    let title: String
    let authorName: String
    let timeLabel: String
}

struct BoardsResponse: Codable {
    let ok: Bool
    let exam: ExamInfo
    let writable: Bool
    let boards: [BoardInfo]
}

struct PostsResponse: Codable {
    let ok: Bool
    let writable: Bool
    let exam: ExamInfo
    let board: BoardMeta
    let posts: [PostSummary]
    let hasMore: Bool?
    let nextCursor: String?
    let source: String?
}

struct HomeFeedResponse: Codable {
    let ok: Bool
    let exam: ExamInfo
    let realtimePosts: [HomeFeedPost]
    let latestPosts: [HomeFeedPost]
    let latestNewsPosts: [HomeFeedPost]
    let source: String?

    enum CodingKeys: String, CodingKey {
        case ok
        case exam
        case realtimePosts
        case latestPosts
        case latestNewsPosts
        case source
    }

    init(
        ok: Bool,
        exam: ExamInfo,
        realtimePosts: [HomeFeedPost],
        latestPosts: [HomeFeedPost],
        latestNewsPosts: [HomeFeedPost],
        source: String?
    ) {
        self.ok = ok
        self.exam = exam
        self.realtimePosts = realtimePosts
        self.latestPosts = latestPosts
        self.latestNewsPosts = latestNewsPosts
        self.source = source
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ok = try container.decode(Bool.self, forKey: .ok)
        exam = try container.decode(ExamInfo.self, forKey: .exam)
        realtimePosts = try container.decode([HomeFeedPost].self, forKey: .realtimePosts)
        latestPosts = try container.decode([HomeFeedPost].self, forKey: .latestPosts)
        latestNewsPosts = try container.decodeIfPresent([HomeFeedPost].self, forKey: .latestNewsPosts) ?? []
        source = try container.decodeIfPresent(String.self, forKey: .source)
    }
}

struct HomeFeedPost: Codable, Identifiable {
    let id: String
    let boardSlug: String
    let boardName: String
    let post: PostSummary

    var hotScore: Int {
        post.likeCount * 3 + post.commentCount * 2 + min(10, post.viewCount / 20)
    }
}

struct BoardMeta: Codable {
    let slug: String
    let name: String
    let description: String?
}

struct PostSummary: Codable, Identifiable {
    let id: String
    let title: String
    let content: String?
    let authorName: String
    let verificationLevel: String?
    let commentCount: Int
    let likeCount: Int
    let viewCount: Int
    let timeLabel: String
    let createdAt: String?
    let isSample: Bool
}

struct PostDetailResponse: Codable {
    let ok: Bool
    let writable: Bool
    let isSamplePost: Bool
    let viewerLiked: Bool?
    let viewerCanDelete: Bool?
    let board: BoardMetaLite
    let post: PostDetail
    let adoptedCommentId: String?
    let comments: [CommentItem]
}

struct BoardMetaLite: Codable {
    let slug: String
    let name: String
}

struct PostDetail: Codable {
    let id: String
    let title: String
    let content: String
    let authorName: String
    let authorId: String?
    let verificationLevel: String?
    let createdAt: String?
    let timeLabel: String
    let viewCount: Int
    let likeCount: Int
}

struct CommentItem: Codable, Identifiable {
    let id: String
    let authorName: String
    let authorId: String?
    let content: String
    let createdAt: String
    let timeLabel: String
    let parentId: String?
    let verificationLevel: String
    let canDelete: Bool?
}

struct GenericOKResponse: Codable {
    let ok: Bool
}

struct LikeResponse: Codable {
    let ok: Bool
    let liked: Bool
    let likeCount: Int?
}

struct AdoptResponse: Codable {
    let ok: Bool
    let awarded: Int
    let selectedAuthorName: String
    let adoptedCommentId: String
}

struct RankingResponse: Codable {
    let ok: Bool
    let totalVotes: Int
    let rankings: [RankingItem]
}

struct RankingItem: Codable, Identifiable {
    let id: String
    let examSlug: String?
    let subject: String
    let instructorName: String
    let rank: Int
    let voteCount: Int
    let votePercent: Double

    enum CodingKeys: String, CodingKey {
        case id
        case examSlug
        case subject
        case instructorName
        case rank
        case voteCount
        case votePercent
    }
}

struct VoteStatusResponse: Codable {
    let ok: Bool
    let hasVoted: Bool
    let instructorName: String?
    let votedAt: String?
}

struct NotificationListResponse: Codable {
    let ok: Bool
    let unreadCount: Int
    let items: [CommunityNotificationItem]
}

struct CommunityNotificationItem: Codable, Identifiable {
    let id: String
    let type: String
    let title: String
    let body: String
    let postId: String?
    let commentId: String?
    let examSlug: String?
    let boardSlug: String?
    let actorName: String?
    let isRead: Bool
    let createdAt: String?
    let timeLabel: String
}

struct NotificationReadResponse: Codable {
    let ok: Bool
    let unreadCount: Int
}

struct PointResponse: Codable {
    let ok: Bool
    let ownerName: String
    let points: Int
    let verificationLevel: String
    let targetUniversity: String?
    let ledger: [LedgerItem]
}

struct LedgerItem: Codable, Identifiable {
    let id: String
    let source: String
    let amount: Int
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case source
        case amount
        case createdAt = "created_at"
    }
}

struct CutoffResponse: Codable {
    let ok: Bool
    let source: String
    let cutoffs: [CutoffItem]
}

struct CutoffItem: Codable, Identifiable {
    let id: String
    let examSlug: String?
    let university: String
    let major: String
    let year: Int
    let scoreBand: String
    let note: String?
    let inputSource: String?

    enum CodingKeys: String, CodingKey {
        case id
        case examSlug
        case university
        case major
        case year
        case scoreBand
        case note
        case inputSource = "source"
    }

    var parsed: ParsedCutoff {
        let isAcademic = major.hasSuffix("__academic")
        let name = isAcademic ? String(major.dropLast("__academic".count)) : major

        var waitlist: Double?
        var initial: Double?
        var memo: String = note ?? ""

        if let note,
           let data = note.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let value = json["waitlistCutoff"] as? Double { waitlist = value }
            if let value = json["initialCutoff"] as? Double { initial = value }
            if let value = json["memo"] as? String { memo = value }
        }

        return ParsedCutoff(
            major: name,
            track: isAcademic ? "학사" : "일반",
            waitlistCutoff: waitlist,
            initialCutoff: initial,
            memo: memo,
            inputBasis: inputSource == "score" ? "score" : "wrong"
        )
    }
}

struct ParsedCutoff {
    let major: String
    let track: String
    let waitlistCutoff: Double?
    let initialCutoff: Double?
    let memo: String
    let inputBasis: String
}

struct DailyBriefingResponse: Codable {
    let ok: Bool
    let source: String
    let briefings: [DailyBriefing]
}

struct DailyBriefing: Codable, Identifiable {
    let id: String
    let title: String
    let summary: String
    let sourceLabel: String
    let publishedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case summary
        case sourceLabel = "source_label"
        case publishedAt = "published_at"
    }
}

struct ScheduleResponse: Codable {
    let ok: Bool
    let source: String
    let schedules: [ExamScheduleItem]
}

struct ExamScheduleItem: Codable, Identifiable, Equatable {
    let id: String
    let examSlug: String
    let university: String?
    let title: String
    let category: String
    let startsAt: String
    let endsAt: String?
    let location: String?
    let organizer: String?
    let linkUrl: String?
    let isOfficial: Bool
    let note: String?

    enum CodingKeys: String, CodingKey {
        case id
        case examSlug = "exam_slug"
        case university
        case title
        case category
        case startsAt = "starts_at"
        case endsAt = "ends_at"
        case location
        case organizer
        case linkUrl = "link_url"
        case isOfficial = "is_official"
        case note
    }
}

struct AdminMeResponse: Codable {
    let ok: Bool
    let isAdmin: Bool
    let canBootstrap: Bool
    let adminEmailConfigured: Bool
}

struct AdminRankingResponse: Codable {
    let ok: Bool
    let totalVotes: Int
    let rankings: [AdminRankingItem]
}

struct AdminRankingItem: Codable, Identifiable {
    let id: String
    let subject: String
    let instructorName: String
    let rank: Int
    let initialRank: Int
    let initialVotes: Int
    let realVoteCount: Int
    let sourceType: String
    let isSeed: Bool
    let voteCount: Int
    let votePercent: Double
}

struct AdminCutoffResponse: Codable {
    let ok: Bool
    let cutoffs: [AdminCutoffItem]
}

struct AdminCutoffItem: Codable, Identifiable {
    let id: String
    let examSlug: String
    let university: String
    let major: String
    let year: Int
    let waitlistCutoff: Double?
    let initialCutoff: Double?
    let memo: String
    let inputBasis: String
    let track: String
}

struct RAGCutoffAnalysisResponse: Codable {
    let ok: Bool
    let source: String?
    let found: Bool
    let status: String?
    let label: String?
    let summary: String?
    let detail: String?
    let targetGuide: String?
    let basis: [String]?
    let message: String?
    let evidenceCount: Int?
    let traceId: String?

    enum CodingKeys: String, CodingKey {
        case ok
        case source
        case found
        case status
        case label
        case summary
        case detail
        case targetGuide
        case basis
        case message
        case evidenceCount
        case traceId
    }
}

struct AIChatResponse: Codable {
    let ok: Bool
    let exam: String
    let intent: String?
    let route: String
    let answer: String
    let needsQuestionSubmission: Bool?
    let contexts: [AIChatContext]
    let cache: String?
    let traceId: String?
    let metrics: AIChatMetrics?

    enum CodingKeys: String, CodingKey {
        case ok
        case exam
        case intent
        case route
        case answer
        case needsQuestionSubmission
        case contexts
        case cache
        case traceId
        case metrics
    }
}

struct AIChatHistoryMessage: Codable {
    let role: String
    let text: String
}

struct AIQuestionSubmitResponse: Codable {
    let ok: Bool
    let message: String?
}

struct AIChatContext: Codable, Identifiable {
    let id: String
    let knowledgeItemId: String
    let similarity: Double
    let preview: String

    enum CodingKeys: String, CodingKey {
        case id
        case knowledgeItemId
        case similarity
        case preview
    }
}

struct AIChatMetrics: Codable {
    let totalMs: Int
    let cacheMs: Int
    let embeddingMs: Int
    let retrievalMs: Int
    let generationMs: Int

    enum CodingKeys: String, CodingKey {
        case totalMs
        case cacheMs
        case embeddingMs
        case retrievalMs
        case generationMs
    }
}

enum AIChatStreamEvent {
    case ready(traceId: String?)
    case meta(intent: String?, route: String?, cache: String?)
    case delta(String)
    case done(AIChatResponse)
}
