import SwiftUI

struct NotificationInboxView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore

    private let api = APIClient()
    private let cacheTTL: TimeInterval = 60 * 15

    private struct NotificationCacheState: Codable {
        let unreadCount: Int
        let items: [CommunityNotificationItem]
        let cachedAt: Date
    }

    @State private var items: [CommunityNotificationItem] = []
    @State private var unreadCount = 0
    @State private var loading = false
    @State private var message = ""
    @State private var didBootstrap = false

    var body: some View {
        VStack(spacing: 0) {
            // Top Tabs (Mock)
            HStack(spacing: 0) {
                VStack(spacing: 8) {
                    Text("새 소식")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Rectangle()
                        .fill(Color.black)
                        .frame(height: 2)
                }
                .frame(maxWidth: .infinity)
                
                VStack(spacing: 8) {
                    Text("키워드")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Rectangle()
                        .fill(Color.clear)
                        .frame(height: 2)
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.top, 10)
            .background(Color.white)
            
            Divider()

            List {
                if !message.isEmpty {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .listRowSeparator(.hidden)
                }

                if items.isEmpty && !loading {
                    Text("알림이 없습니다.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 20)
                        .listRowSeparator(.hidden)
                } else {
                    let rows = items
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, item in
                        notificationRow(item)
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(item.isRead ? Color.white : Color(.systemGray6).opacity(0.4))
                            .listRowSeparator(.hidden)
                            
                        if index < rows.count - 1 {
                            Divider()
                                .listRowInsets(EdgeInsets())
                                .listRowSeparator(.hidden)
                        }
                    }
                }
            }
            .listStyle(.plain)
            .refreshable {
                await load(forceRefresh: true)
            }
        }
        .navigationTitle("알림")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if unreadCount > 0 {
                    Button("모두 읽음") {
                        Task { await markAllRead() }
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.gray)
                }
            }
        }
        .task {
            guard !didBootstrap else { return }
            didBootstrap = true
            applyCachedStateIfAvailable()
            await load()
        }
    }

    private func notificationRow(_ item: CommunityNotificationItem) -> some View {
        HStack(alignment: .top, spacing: 14) {
            // Left Icon
            ZStack {
                Circle()
                    .stroke(Color.red.opacity(0.8), lineWidth: 1.5)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(Color.white))
                Image(systemName: "bell.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(.red)
            }
            .padding(.top, 2)

            // Right Content
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(item.type == "new_comment" ? "커뮤니티 새 댓글" : "커뮤니티 알림")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                    Spacer()
                    if !item.isRead {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 5, height: 5)
                    }
                }
                
                Text(item.body.isEmpty ? item.title : item.body)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                
                Text(item.timeLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 18)
    }

    @MainActor
    private func load(forceRefresh: Bool = false) async {
        guard let userID = session.user?.id else {
            items = []
            unreadCount = 0
            message = "로그인 후 알림을 확인할 수 있어."
            return
        }
        guard !session.accessToken.isEmpty else {
            items = []
            unreadCount = 0
            message = "로그인이 만료됐어. 다시 로그인해줘."
            return
        }

        if loading && !forceRefresh { return }
        loading = true
        message = ""
        defer { loading = false }

        do {
            let response = try await api.fetchNotifications(
                baseURL: config.baseURL,
                userId: userID,
                accessToken: session.accessToken,
                limit: 60
            )
            items = response.items
            unreadCount = response.unreadCount
            saveCache(for: userID)
        } catch {
            if APIClient.isCancellationError(error) { return }
            message = error.localizedDescription
        }
    }

    @MainActor
    private func markAllRead() async {
        guard !session.accessToken.isEmpty else { return }
        do {
            let response = try await api.markAllNotificationsRead(
                baseURL: config.baseURL,
                accessToken: session.accessToken
            )
            unreadCount = response.unreadCount
            items = items.map { item in
                CommunityNotificationItem(
                    id: item.id,
                    type: item.type,
                    title: item.title,
                    body: item.body,
                    postId: item.postId,
                    commentId: item.commentId,
                    examSlug: item.examSlug,
                    boardSlug: item.boardSlug,
                    actorName: item.actorName,
                    isRead: true,
                    createdAt: item.createdAt,
                    timeLabel: item.timeLabel
                )
            }
            if let userID = session.user?.id {
                saveCache(for: userID)
            }
        } catch {
            if APIClient.isCancellationError(error) { return }
            message = error.localizedDescription
        }
    }

    private func cacheKey(for userID: String) -> String {
        "notification_inbox_cache_\(userID)"
    }

    @MainActor
    private func applyCachedStateIfAvailable() {
        guard let userID = session.user?.id else { return }
        let key = cacheKey(for: userID)
        guard let data = UserDefaults.standard.data(forKey: key) else { return }
        guard let cached = try? JSONDecoder().decode(NotificationCacheState.self, from: data) else { return }

        let age = Date().timeIntervalSince(cached.cachedAt)
        if age > cacheTTL { return }
        items = cached.items
        unreadCount = cached.unreadCount
    }

    private func saveCache(for userID: String) {
        let key = cacheKey(for: userID)
        let payload = NotificationCacheState(
            unreadCount: unreadCount,
            items: items,
            cachedAt: Date()
        )
        if let data = try? JSONEncoder().encode(payload) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
