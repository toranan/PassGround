import SwiftUI

private let communityPrimary = Color(red: 79/255, green: 70/255, blue: 229/255)

struct CommunityBoardsView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var communityStore: CommunityStore

    private let api = APIClient()

    @State private var exam: ExamSlug = .transfer
    @State private var boards: [BoardInfo] = []
    @State private var writable = true
    @State private var loading = false
    @State private var message = ""
    @State private var didBootstrap = false
    @State private var lastAutoRefreshAt = Date.distantPast

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if loading {
                    ProgressView("게시판 불러오는 중...")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(30)
                }

                if !message.isEmpty {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }

                boardsList
                    .padding(.top, 16)
            }
            .padding(.bottom, 20)
        }
        .background(Color.white)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("커뮤니티")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.primary)
            }
        }
        .task {
            guard !didBootstrap else { return }
            didBootstrap = true
            let fresh = applyCachedSnapshotIfAvailable()
            if !fresh {
                await loadBoards()
            }
        }
        .onAppear {
            refreshBoardsIfStale()
        }
        .refreshable {
            await loadBoards(forceRefresh: true)
        }
    }

    private var boardsList: some View {
        VStack(alignment: .leading, spacing: 0) {
            if boards.isEmpty {
                Text("표시할 게시판이 없습니다.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 20)
            } else {
                let rows = boards
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, board in
                    NavigationLink {
                        BoardPostsView(exam: exam, board: board, writable: writable)
                    } label: {
                        boardRow(board)
                    }
                    .buttonStyle(.plain)

                    if index < rows.count - 1 {
                        Divider()
                            .padding(.horizontal, 20)
                    }
                }
            }
        }
    }

    private func boardRow(_ board: BoardInfo) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(board.name)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.primary)
                Spacer()
                Text("\(board.preview.count)개")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(board.description)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if let first = board.preview.first {
                HStack(spacing: 6) {
                    Circle()
                        .fill(communityPrimary)
                        .frame(width: 4, height: 4)
                    Text(first.title)
                        .font(.caption)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Spacer()
                    Text(first.timeLabel)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
    }

    private func loadBoards(forceRefresh: Bool = false) async {
        if loading { return }
        loading = true
        message = ""
        let cachePolicy: URLRequest.CachePolicy = forceRefresh ? .reloadIgnoringLocalCacheData : .useProtocolCachePolicy
        do {
            let response = try await api.fetchBoards(baseURL: config.baseURL, exam: exam, cachePolicy: cachePolicy)
            let resolvedBoards = response.boards.isEmpty ? fallbackBoards(for: exam) : response.boards
            boards = resolvedBoards
            writable = response.writable
            communityStore.saveBoardsSnapshot(exam: exam, boards: resolvedBoards, writable: writable)
            if response.boards.isEmpty {
                message = "기본 게시판 목록을 표시합니다."
            }
        } catch {
            if isCancellation(error) {
                loading = false
                return
            }
            if boards.isEmpty {
                boards = fallbackBoards(for: exam)
            }
            message = readableErrorMessage(error)
        }
        loading = false
    }

    @discardableResult
    private func applyCachedSnapshotIfAvailable() -> Bool {
        guard let snapshot = communityStore.boardsSnapshot(exam: exam) else {
            return false
        }
        boards = snapshot.boards
        writable = snapshot.writable
        message = ""
        return Date().timeIntervalSince(snapshot.updatedAt) <= CommunityStore.boardsFreshWindow
    }

    private func refreshBoardsIfStale() {
        let fresh = applyCachedSnapshotIfAvailable()
        guard !fresh, !loading else { return }
        let now = Date()
        guard now.timeIntervalSince(lastAutoRefreshAt) > 8 else { return }
        lastAutoRefreshAt = now
        Task { await loadBoards() }
    }

    private func fallbackBoards(for exam: ExamSlug) -> [BoardInfo] {
        _ = exam
        return [
            BoardInfo(id: "transfer-free", slug: "free", name: "자유게시판", description: "수험생 일상/멘탈/루틴 공유", preview: []),
            BoardInfo(id: "transfer-qa", slug: "qa", name: "학습법공유", description: "대학/전형/학습 전략 질문과 답변", preview: []),
            BoardInfo(id: "transfer-study-qa", slug: "study-qa", name: "학습질문", description: "영어/수학/논술 과목별 공부법 질문과 답변", preview: []),
            BoardInfo(id: "transfer-admit", slug: "admit-review", name: "합격수기", description: "합격생 인증 기반 수기와 노하우", preview: [])
        ]
    }

    private func readableErrorMessage(_ error: Error) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .cannotFindHost, .cannotConnectToHost:
                return "서버에 연결할 수 없습니다. 인터넷 설정이나 서버 주소를 확인해 주세요."
            case .notConnectedToInternet:
                return "인터넷 연결을 확인해 주세요."
            default:
                return urlError.localizedDescription
            }
        }
        return error.localizedDescription
    }

    private func isCancellation(_ error: Error) -> Bool {
        APIClient.isCancellationError(error)
    }
}
