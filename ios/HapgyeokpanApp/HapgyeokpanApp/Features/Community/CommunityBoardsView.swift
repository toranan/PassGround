import SwiftUI

struct CommunityBoardsView: View {
    @EnvironmentObject private var config: AppConfig

    private let api = APIClient()
    private let exam: ExamSlug = .transfer
    private let board = BoardInfo(
        id: "transfer-free",
        slug: "free",
        name: "커뮤니티",
        description: "",
        preview: []
    )

    @State private var writable = true
    @State private var didLoadWritable = false

    var body: some View {
        BoardPostsView(
            exam: exam,
            board: board,
            writable: writable,
            hideBoardHeader: true
        )
        .task {
            guard !didLoadWritable else { return }
            didLoadWritable = true
            await loadWritable()
        }
    }

    private func loadWritable() async {
        do {
            let response = try await api.fetchBoards(baseURL: config.baseURL, exam: exam)
            writable = response.writable
        } catch {
            // keep default writable=true on failure
        }
    }
}
