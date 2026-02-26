import Foundation
import os

enum APIClientError: LocalizedError {
    case invalidURL
    case invalidResponse
    case emptyResponse
    case server(message: String)
    case decoding

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "잘못된 URL입니다."
        case .invalidResponse:
            return "응답을 확인할 수 없습니다."
        case .emptyResponse:
            return "응답 데이터가 없습니다."
        case .server(let message):
            return message
        case .decoding:
            return "응답 파싱에 실패했습니다."
        }
    }
}

final class APIClient {
    private static let logger = Logger(subsystem: "kr.hapgyeokpan.ios", category: "network")
    private let session: URLSession
    private let decoder: JSONDecoder

    init(session: URLSession = .shared) {
        self.session = session
        self.decoder = JSONDecoder()
    }

    func finalizeOAuth(baseURL: URL, accessToken: String, refreshToken: String) async throws -> OAuthExchangeResponse {
        struct Body: Encodable { 
            let accessToken: String
            let refreshToken: String
        }
        return try await request(
            baseURL: baseURL,
            path: "api/auth/oauth/finalize",
            method: "POST",
            body: Body(accessToken: accessToken, refreshToken: refreshToken)
        )
    }

    func fetchBoards(
        baseURL: URL,
        exam: ExamSlug,
        cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy
    ) async throws -> BoardsResponse {
        try await request(
            baseURL: baseURL,
            path: "api/mobile/boards/\(exam.rawValue)",
            cachePolicy: cachePolicy
        )
    }

    func fetchPosts(
        baseURL: URL,
        exam: ExamSlug,
        board: String,
        limit: Int = 20,
        cursor: String? = nil,
        cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy
    ) async throws -> PostsResponse {
        var query: [URLQueryItem] = [
            URLQueryItem(name: "exam", value: exam.rawValue),
            URLQueryItem(name: "board", value: board),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        if let cursor, !cursor.isEmpty {
            query.append(URLQueryItem(name: "cursor", value: cursor))
        }

        return try await request(
            baseURL: baseURL,
            path: "api/mobile/posts",
            query: query,
            cachePolicy: cachePolicy
        )
    }

    func fetchHomeFeed(
        baseURL: URL,
        exam: ExamSlug,
        cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy
    ) async throws -> HomeFeedResponse {
        try await request(
            baseURL: baseURL,
            path: "api/mobile/home",
            query: [URLQueryItem(name: "exam", value: exam.rawValue)],
            cachePolicy: cachePolicy
        )
    }

    func fetchPostDetail(
        baseURL: URL,
        exam: ExamSlug,
        board: String,
        postId: String,
        userId: String?,
        cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy
    ) async throws -> PostDetailResponse {
        var query: [URLQueryItem] = [
            URLQueryItem(name: "exam", value: exam.rawValue),
            URLQueryItem(name: "board", value: board)
        ]
        if let userId, !userId.isEmpty {
            query.append(URLQueryItem(name: "userId", value: userId))
        }
        return try await request(
            baseURL: baseURL,
            path: "api/mobile/posts/\(postId)",
            query: query,
            cachePolicy: cachePolicy
        )
    }

    func fetchCutoffs(
        baseURL: URL,
        exam: ExamSlug,
        cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy
    ) async throws -> CutoffResponse {
        try await request(
            baseURL: baseURL,
            path: "api/cutoffs",
            query: [URLQueryItem(name: "exam", value: exam.rawValue)],
            cachePolicy: cachePolicy
        )
    }

    func fetchBriefings(baseURL: URL, exam: ExamSlug) async throws -> DailyBriefingResponse {
        try await request(baseURL: baseURL, path: "api/daily/\(exam.rawValue)")
    }

    func fetchSchedules(
        baseURL: URL,
        exam: ExamSlug,
        cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy
    ) async throws -> ScheduleResponse {
        try await request(
            baseURL: baseURL,
            path: "api/schedules",
            query: [URLQueryItem(name: "exam", value: exam.rawValue)],
            cachePolicy: cachePolicy
        )
    }

    func fetchRankings(
        baseURL: URL,
        exam: ExamSlug,
        cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy
    ) async throws -> RankingResponse {
        try await request(
            baseURL: baseURL,
            path: "api/rankings/\(exam.rawValue)",
            cachePolicy: cachePolicy
        )
    }

    func fetchVoteStatus(baseURL: URL, exam: ExamSlug, accessToken: String) async throws -> VoteStatusResponse {
        try await request(
            baseURL: baseURL,
            path: "api/rankings/\(exam.rawValue)/vote",
            accessToken: accessToken
        )
    }

    func vote(baseURL: URL, exam: ExamSlug, accessToken: String, instructorName: String, subject: String?) async throws -> VoteStatusResponse {
        struct Body: Encodable {
            let instructorName: String
            let subject: String?
        }
        _ = try await request(
            baseURL: baseURL,
            path: "api/rankings/\(exam.rawValue)/vote",
            method: "POST",
            body: Body(instructorName: instructorName, subject: subject),
            accessToken: accessToken
        ) as GenericOKResponse

        return try await fetchVoteStatus(baseURL: baseURL, exam: exam, accessToken: accessToken)
    }

    func createPost(baseURL: URL, exam: ExamSlug, board: String, authorName: String, title: String, content: String) async throws {
        struct Body: Encodable {
            let examSlug: String
            let boardSlug: String
            let authorName: String
            let title: String
            let content: String
        }

        _ = try await request(
            baseURL: baseURL,
            path: "api/posts/create",
            method: "POST",
            body: Body(examSlug: exam.rawValue, boardSlug: board, authorName: authorName, title: title, content: content)
        ) as GenericOKResponse
    }

    func createComment(baseURL: URL, postId: String, parentId: String?, authorName: String, content: String) async throws {
        struct Body: Encodable {
            let postId: String
            let parentId: String?
            let authorName: String
            let content: String
        }

        _ = try await request(
            baseURL: baseURL,
            path: "api/comments/create",
            method: "POST",
            body: Body(postId: postId, parentId: parentId, authorName: authorName, content: content)
        ) as GenericOKResponse
    }

    func toggleLike(baseURL: URL, postId: String, userId: String) async throws -> LikeResponse {
        struct Body: Encodable {
            let postId: String
            let userId: String
        }

        return try await request(
            baseURL: baseURL,
            path: "api/posts/like",
            method: "POST",
            body: Body(postId: postId, userId: userId)
        )
    }

    func adoptComment(baseURL: URL, postId: String, commentId: String, adopterName: String) async throws -> AdoptResponse {
        struct Body: Encodable {
            let postId: String
            let commentId: String
            let adopterName: String
        }

        return try await request(
            baseURL: baseURL,
            path: "api/comments/adopt",
            method: "POST",
            body: Body(postId: postId, commentId: commentId, adopterName: adopterName)
        )
    }

    func fetchPoints(baseURL: URL, userId: String?, nickname: String?) async throws -> PointResponse {
        var query: [URLQueryItem] = []
        if let userId, !userId.isEmpty {
            query.append(URLQueryItem(name: "userId", value: userId))
        }
        if let nickname, !nickname.isEmpty {
            query.append(URLQueryItem(name: "nickname", value: nickname))
        }

        return try await request(baseURL: baseURL, path: "api/points/me", query: query)
    }

    func updateNickname(baseURL: URL, accessToken: String, userId: String, nickname: String) async throws -> SessionUser {
        struct Body: Encodable {
            let accessToken: String
            let userId: String
            let nickname: String
        }

        struct Response: Codable {
            let ok: Bool
            let user: SessionUser
        }

        let response: Response = try await request(
            baseURL: baseURL,
            path: "api/profile/update",
            method: "POST",
            body: Body(accessToken: accessToken, userId: userId, nickname: nickname)
        )

        return response.user
    }

    func upload(baseURL: URL, data: Data, filename: String, mimeType: String, usage: String?) async throws -> String {
        guard let url = URL(string: "api/upload", relativeTo: baseURL) else {
            throw APIClientError.invalidURL
        }

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        if let usage, !usage.isEmpty {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"usage\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(usage)\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        Self.logRequest(method: "POST", url: url)

        let (responseData, response): (Data, URLResponse)
        do {
            (responseData, response) = try await session.data(for: request)
        } catch {
            if Self.isCancellation(error) {
                Self.logger.debug("REQUEST_CANCELLED url=\(url.absoluteString, privacy: .public)")
            } else {
                Self.logTransportError(error, url: url)
                Self.raiseDebugIssue("Upload transport failure: \(error.localizedDescription)\n\(url.absoluteString)")
            }
            throw error
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            Self.raiseDebugIssue("Invalid upload response object for \(url.absoluteString)")
            throw APIClientError.invalidResponse
        }

        Self.logResponse(statusCode: httpResponse.statusCode, url: url, bytes: responseData.count)

        struct UploadResponse: Decodable {
            let ok: Bool
            let url: String
        }

        if httpResponse.statusCode < 200 || httpResponse.statusCode >= 300 {
            let error = parseError(
                from: responseData,
                statusCode: httpResponse.statusCode,
                url: url
            )
            Self.logHTTPError(error, url: url, responseData: responseData, statusCode: httpResponse.statusCode)
            if httpResponse.statusCode >= 500 {
                Self.raiseDebugIssue("Upload HTTP \(httpResponse.statusCode) at \(url.absoluteString)\n\(error.localizedDescription)")
            }
            throw error
        }

        guard let payload = try? decoder.decode(UploadResponse.self, from: responseData) else {
            let snippet = String(data: responseData.prefix(180), encoding: .utf8) ?? "<binary>"
            Self.logger.error("Upload decoding failed url=\(url.absoluteString, privacy: .public) body=\(snippet, privacy: .public)")
            Self.raiseDebugIssue("Upload decoding failure at \(url.absoluteString)\n\(snippet)")
            throw APIClientError.decoding
        }
        return payload.url
    }

    func requestVerification(
        baseURL: URL,
        userId: String?,
        requesterName: String,
        exam: ExamSlug,
        verificationType: String,
        evidenceURL: String,
        memo: String
    ) async throws {
        struct Body: Encodable {
            let userId: String?
            let requesterName: String
            let examSlug: String
            let verificationType: String
            let evidenceUrl: String
            let memo: String
        }

        _ = try await request(
            baseURL: baseURL,
            path: "api/verification/request",
            method: "POST",
            body: Body(
                userId: userId,
                requesterName: requesterName,
                examSlug: exam.rawValue,
                verificationType: verificationType,
                evidenceUrl: evidenceURL,
                memo: memo
            )
        ) as GenericOKResponse
    }

    func fetchAdminMe(baseURL: URL, accessToken: String) async throws -> AdminMeResponse {
        try await request(baseURL: baseURL, path: "api/admin/me", accessToken: accessToken)
    }

    func bootstrapAdmin(baseURL: URL, accessToken: String) async throws {
        _ = try await request(
            baseURL: baseURL,
            path: "api/admin/bootstrap",
            method: "POST",
            accessToken: accessToken
        ) as GenericOKResponse
    }

    func fetchAdminRankings(baseURL: URL, exam: ExamSlug, accessToken: String) async throws -> AdminRankingResponse {
        try await request(
            baseURL: baseURL,
            path: "api/admin/rankings/\(exam.rawValue)",
            accessToken: accessToken
        )
    }

    func addAdminRanking(baseURL: URL, exam: ExamSlug, accessToken: String, subject: String, instructorName: String, initialRank: Int?, initialVotes: Int) async throws -> AdminRankingResponse {
        struct Body: Encodable {
            let subject: String
            let instructorName: String
            let initialRank: Int?
            let initialVotes: Int
        }

        return try await request(
            baseURL: baseURL,
            path: "api/admin/rankings/\(exam.rawValue)",
            method: "POST",
            body: Body(subject: subject, instructorName: instructorName, initialRank: initialRank, initialVotes: initialVotes),
            accessToken: accessToken
        )
    }

    func deleteAdminRanking(baseURL: URL, exam: ExamSlug, id: String, accessToken: String) async throws -> AdminRankingResponse {
        struct Body: Encodable { let id: String }

        return try await request(
            baseURL: baseURL,
            path: "api/admin/rankings/\(exam.rawValue)",
            method: "DELETE",
            body: Body(id: id),
            accessToken: accessToken
        )
    }

    func fetchAdminCutoffs(baseURL: URL, exam: ExamSlug, accessToken: String) async throws -> AdminCutoffResponse {
        try await request(
            baseURL: baseURL,
            path: "api/admin/cutoffs",
            query: [URLQueryItem(name: "exam", value: exam.rawValue)],
            accessToken: accessToken
        )
    }

    func upsertAdminCutoff(
        baseURL: URL,
        exam: ExamSlug,
        accessToken: String,
        university: String,
        major: String,
        year: Int,
        track: String,
        inputBasis: String,
        waitlistCutoff: Double?,
        initialCutoff: Double?,
        memo: String
    ) async throws -> AdminCutoffResponse {
        struct Body: Encodable {
            let exam: String
            let university: String
            let major: String
            let year: Int
            let track: String
            let inputBasis: String
            let waitlistCutoff: Double?
            let initialCutoff: Double?
            let memo: String
        }

        return try await request(
            baseURL: baseURL,
            path: "api/admin/cutoffs",
            method: "POST",
            body: Body(
                exam: exam.rawValue,
                university: university,
                major: major,
                year: year,
                track: track,
                inputBasis: inputBasis,
                waitlistCutoff: waitlistCutoff,
                initialCutoff: initialCutoff,
                memo: memo
            ),
            accessToken: accessToken
        )
    }

    func deleteAdminCutoff(baseURL: URL, exam: ExamSlug, id: String, accessToken: String) async throws -> AdminCutoffResponse {
        struct Body: Encodable {
            let id: String
            let exam: String
        }

        return try await request(
            baseURL: baseURL,
            path: "api/admin/cutoffs",
            method: "DELETE",
            body: Body(id: id, exam: exam.rawValue),
            accessToken: accessToken
        )
    }

    private func request<T: Decodable>(
        baseURL: URL,
        path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: (any Encodable)? = nil,
        accessToken: String? = nil,
        cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy
    ) async throws -> T {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw APIClientError.invalidURL
        }

        if !query.isEmpty {
            components.queryItems = query
        }

        guard let url = components.url else {
            throw APIClientError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = cachePolicy
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let accessToken, !accessToken.isEmpty {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }

        Self.logRequest(method: method, url: url)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            if Self.isCancellation(error) {
                Self.logger.debug("REQUEST_CANCELLED url=\(url.absoluteString, privacy: .public)")
            } else {
                Self.logTransportError(error, url: url)
                Self.raiseDebugIssue("Network transport failure: \(error.localizedDescription)\n\(url.absoluteString)")
            }
            throw error
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            Self.raiseDebugIssue("Invalid response object for \(url.absoluteString)")
            throw APIClientError.invalidResponse
        }

        Self.logResponse(statusCode: httpResponse.statusCode, url: url, bytes: data.count)

        guard (200...299).contains(httpResponse.statusCode) else {
            let error = parseError(
                from: data,
                statusCode: httpResponse.statusCode,
                url: url
            )
            Self.logHTTPError(error, url: url, responseData: data, statusCode: httpResponse.statusCode)
            if httpResponse.statusCode >= 500 {
                Self.raiseDebugIssue("HTTP \(httpResponse.statusCode) at \(url.absoluteString)\n\(error.localizedDescription)")
            }
            throw error
        }

        if T.self == GenericOKResponse.self, data.isEmpty {
            return GenericOKResponse(ok: true) as! T
        }

        guard let payload = try? decoder.decode(T.self, from: data) else {
            let snippet = String(data: data.prefix(180), encoding: .utf8) ?? "<binary>"
            Self.logger.error("Decoding failed url=\(url.absoluteString, privacy: .public) body=\(snippet, privacy: .public)")
            Self.raiseDebugIssue("Decoding failure at \(url.absoluteString)\n\(snippet)")
            throw APIClientError.decoding
        }
        return payload
    }

    private func parseError(from data: Data, statusCode: Int? = nil, url: URL? = nil) -> APIClientError {
        if let payload = try? decoder.decode(APIErrorResponse.self, from: data) {
            return .server(message: decorate(message: payload.error, statusCode: statusCode, url: url))
        }

        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let message = (object["error"] as? String) ?? (object["message"] as? String) {
            return .server(message: decorate(message: message, statusCode: statusCode, url: url))
        }

        if let raw = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !raw.isEmpty {
            let snippet = String(raw.prefix(140))
            if snippet.lowercased().contains("<html") || snippet.lowercased().contains("<!doctype html") {
                return .server(
                    message: decorate(
                        message: "서버가 JSON이 아닌 HTML을 반환했습니다. 배포 라우팅/API 경로를 확인해 주세요.",
                        statusCode: statusCode,
                        url: url
                    )
                )
            }
            return .server(
                message: decorate(
                    message: "서버 응답: \(snippet)",
                    statusCode: statusCode,
                    url: url
                )
            )
        }

        if statusCode == 404 {
            return .server(
                message: decorate(
                    message: "API 경로를 찾지 못했습니다(404).",
                    statusCode: statusCode,
                    url: url
                )
            )
        }

        return .server(message: decorate(message: "요청 처리에 실패했습니다.", statusCode: statusCode, url: url))
    }

    private func decorate(message: String, statusCode: Int?, url: URL?) -> String {
        var parts: [String] = [message]
        if let statusCode {
            parts.append("(HTTP \(statusCode))")
        }
        if let url {
            parts.append("\n\(url.absoluteString)")
        }
        return parts.joined(separator: " ")
    }

    private static func logRequest(method: String, url: URL) {
        logger.log("REQ \(method, privacy: .public) \(url.absoluteString, privacy: .public)")
    }

    private static func logResponse(statusCode: Int, url: URL, bytes: Int) {
        logger.log("RES \(statusCode, privacy: .public) \(url.absoluteString, privacy: .public) bytes=\(bytes, privacy: .public)")
    }

    private static func logTransportError(_ error: Error, url: URL) {
        logger.error("TRANSPORT_ERROR url=\(url.absoluteString, privacy: .public) err=\(error.localizedDescription, privacy: .public)")
    }

    private static func logHTTPError(_ error: Error, url: URL, responseData: Data, statusCode: Int) {
        let snippet = String(data: responseData.prefix(180), encoding: .utf8) ?? "<binary>"
        logger.error("HTTP_ERROR \(statusCode, privacy: .public) url=\(url.absoluteString, privacy: .public) err=\(error.localizedDescription, privacy: .public) body=\(snippet, privacy: .public)")
    }

    static func isCancellationError(_ error: Error) -> Bool {
        if error is CancellationError {
            return true
        }
        if let urlError = error as? URLError, urlError.code == .cancelled {
            return true
        }
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return true
        }
        if let underlying = nsError.userInfo[NSUnderlyingErrorKey] as? Error,
           isCancellationError(underlying) {
            return true
        }
        if nsError.localizedDescription.lowercased().contains("cancelled") {
            return true
        }
        return false
    }

    private static func isCancellation(_ error: Error) -> Bool {
        isCancellationError(error)
    }

    private static func raiseDebugIssue(_ message: String) {
#if DEBUG
        assertionFailure(message)
#endif
    }
}

private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void

    init(_ wrapped: any Encodable) {
        self.encodeFunc = { encoder in
            try wrapped.encode(to: encoder)
        }
    }

    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}
