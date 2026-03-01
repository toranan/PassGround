import SwiftUI
import Foundation

private enum DataCenterTab: String, CaseIterable {
    case ranking = "강사 랭킹"
    case cutoff = "최신 커트라인"
    case aiCutoff = "AI 커트라인 분석"
}

private struct CutoffAnalysisResult {
    let verdict: String
    let verdictColor: Color
    let basisLabel: String
    let detail: String
    let targetGuide: String
    let references: [String]
}

struct RankingView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var communityStore: CommunityStore
    @Environment(\.scenePhase) private var scenePhase

    private let api = APIClient()

    @State private var exam: ExamSlug = .transfer
    @State private var currentTab: DataCenterTab = .ranking
    
    // Rankings
    @State private var rankings: [RankingItem] = []
    @State private var selectedInstructor = ""
    @State private var voteModeCustom = false
    @State private var customSubject = ""
    @State private var customInstructor = ""
    
    // Cutoffs
    @State private var cutoffs: [CutoffItem] = []
    @State private var analysisYear = ""
    @State private var analysisUniversity = ""
    @State private var analysisMajor = ""
    @State private var analysisScore = ""
    @State private var analysisMessage = ""
    @State private var analysisResult: CutoffAnalysisResult?
    @State private var analysisLoading = false
    
    // Status
    @State private var voteStatus: VoteStatusResponse?
    @State private var loading = false
    @State private var errorMessage = ""
    
    // Modals
    @State private var showVoteSheet = false
    @State private var voteMessage = ""
    @State private var didBootstrap = false
    @State private var lastAutoRefreshAt = Date.distantPast
    @State private var lastVoteStatusFetchAt = Date.distantPast

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Header & Tab Selection
                VStack(alignment: .leading, spacing: 16) {
                    Text("데이터 센터")
                        .font(.title2)
                        .fontWeight(.bold)
                        .padding(.horizontal, DesignSystem.padding)
                    
                    HStack(spacing: 16) {
                        Button(action: { currentTab = .ranking }) {
                            Text(DataCenterTab.ranking.rawValue)
                                .font(.subheadline)
                                .fontWeight(currentTab == .ranking ? .bold : .medium)
                                .foregroundColor(currentTab == .ranking ? DesignSystem.primary : .gray)
                        }
                        Button(action: { currentTab = .cutoff }) {
                            Text(DataCenterTab.cutoff.rawValue)
                                .font(.subheadline)
                                .fontWeight(currentTab == .cutoff ? .bold : .medium)
                                .foregroundColor(currentTab == .cutoff ? DesignSystem.primary : .gray)
                        }
                        Button(action: { currentTab = .aiCutoff }) {
                            Text(DataCenterTab.aiCutoff.rawValue)
                                .font(.subheadline)
                                .fontWeight(currentTab == .aiCutoff ? .bold : .medium)
                                .foregroundColor(currentTab == .aiCutoff ? DesignSystem.primary : .gray)
                        }
                        Spacer()
                    }
                    .padding(.horizontal, DesignSystem.padding)
                }
                .padding(.top, 10)
                
                if loading && rankings.isEmpty {
                    ProgressView("데이터를 불러오는 중...")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(40)
                } else if !errorMessage.isEmpty {
                    Text(errorMessage)
                        .foregroundColor(.red)
                        .font(.footnote)
                        .padding()
                } else {
                    if currentTab == .cutoff {
                        cutoffList
                    } else if currentTab == .aiCutoff {
                        cutoffAnalysisView
                    } else {
                        rankingList
                    }
                }
            }
            .padding(.vertical, 10)
        }
        .background(DesignSystem.background)
        .navigationTitle("")
        .navigationBarHidden(true)
        .task {
            guard !didBootstrap else { return }
            didBootstrap = true
            let fresh = applyCachedSnapshotIfAvailable()
            if !fresh {
                await loadData()
            }
            await refreshVoteStatusIfNeeded()
        }
        .onAppear {
            refreshIfStale()
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active {
                refreshIfStale()
            }
        }
        .onChange(of: showVoteSheet) { open in
            if open {
                Task { await refreshVoteStatusIfNeeded(forceRefresh: true) }
            }
        }
        .refreshable {
            await loadData(forceRefresh: true)
        }
        .sheet(isPresented: $showVoteSheet) {
            voteSheetView
        }
    }
    
    // MARK: - Ranking View
    private var rankingList: some View {
        VStack(spacing: 0) {
            HStack {
                Text("인기 강사 순위")
                    .font(.headline)
                Spacer()
                Button(action: { showVoteSheet = true }) {
                    Text("투표하기")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(DesignSystem.primary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(DesignSystem.primary.opacity(0.1))
                        .cornerRadius(12)
                }
            }
            .padding(.horizontal, DesignSystem.padding)
            .padding(.bottom, 12)
            
            VStack(spacing: 0) {
                if rankings.isEmpty {
                    Text("랭킹 데이터가 없습니다.")
                        .foregroundColor(.secondary)
                        .padding(40)
                } else {
                    ForEach(Array(rankings.enumerated()), id: \.element.id) { index, row in
                        HStack(spacing: 16) {
                            Text("\(row.rank)")
                                .font(.title3)
                                .fontWeight(.bold)
                                .foregroundColor(row.rank <= 3 ? DesignSystem.primary : .gray)
                                .frame(width: 28, alignment: .center)
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text(row.instructorName)
                                    .font(.body)
                                    .fontWeight(.semibold)
                                Text(row.subject)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            
                            Spacer()
                        }
                        .padding(.horizontal, DesignSystem.padding)
                        .padding(.vertical, 14)
                        
                        if index < rankings.count - 1 {
                            Divider()
                                .padding(.leading, DesignSystem.padding + 44)
                        }
                    }
                }
            }
            .background(DesignSystem.cardBackground)
            .cornerRadius(DesignSystem.cardCornerRadius)
            .padding(.horizontal, DesignSystem.padding)
        }
    }
    
    // MARK: - Cutoff View
    private var cutoffList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("대학별 최신 커트라인")
                .font(.headline)
                .padding(.horizontal, DesignSystem.padding)
                .padding(.bottom, 12)
            
            VStack(spacing: 0) {
                if cutoffs.isEmpty {
                    Text("등록된 커트라인이 없습니다.")
                        .foregroundColor(.secondary)
                        .padding(40)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(Array(cutoffs.enumerated()), id: \.element.id) { index, row in
                        let parsed = row.parsed
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(row.university) \(parsed.major) (\(parsed.track))")
                                    .font(.body)
                                    .fontWeight(.semibold)
                                Text("\(row.year)년도 기준")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 4) {
                                Text(row.scoreBand)
                                    .font(.subheadline)
                                    .fontWeight(.bold)
                                    .foregroundColor(DesignSystem.primary)
                            }
                        }
                        .padding(.horizontal, DesignSystem.padding)
                        .padding(.vertical, 14)
                        
                        if index < cutoffs.count - 1 {
                            Divider()
                                .padding(.leading, DesignSystem.padding)
                        }
                    }
                }
            }
            .background(DesignSystem.cardBackground)
            .cornerRadius(DesignSystem.cardCornerRadius)
            .padding(.horizontal, DesignSystem.padding)
        }
    }

    private var cutoffAnalysisView: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("AI 커트라인 분석")
                .font(.headline)
                .padding(.horizontal, DesignSystem.padding)

            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    TextField("학년도 (예: 2026)", text: $analysisYear)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.numberPad)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 11)
                        .background(Color(.systemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                    TextField("점수 / 틀린 개수", text: $analysisScore)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.decimalPad)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 11)
                        .background(Color(.systemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                TextField("학교명 (예: 성균관대학교)", text: $analysisUniversity)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 11)
                    .background(Color(.systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                TextField("학과명 (예: 소프트웨어학과)", text: $analysisMajor)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 11)
                    .background(Color(.systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                Button(action: {
                    Task { await runCutoffAnalysis() }
                }) {
                    Text(analysisLoading ? "분석 중..." : "분석하기")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(analysisLoading ? DesignSystem.primary.opacity(0.55) : DesignSystem.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .disabled(analysisLoading)
            }
            .padding(12)
            .background(DesignSystem.cardBackground)
            .cornerRadius(DesignSystem.cardCornerRadius)
            .padding(.horizontal, DesignSystem.padding)

            if !analysisMessage.isEmpty {
                Text(analysisMessage)
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, DesignSystem.padding)
            }

            if let result = analysisResult {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text(result.verdict)
                            .font(.title3.bold())
                            .foregroundColor(result.verdictColor)
                        Spacer()
                        Text(result.basisLabel)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Text(result.detail)
                        .font(.subheadline)
                        .foregroundColor(.primary)

                    Text(result.targetGuide)
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    if !result.references.isEmpty {
                        Divider()
                        VStack(alignment: .leading, spacing: 4) {
                            Text("참고 데이터")
                                .font(.caption.bold())
                                .foregroundColor(.secondary)
                            ForEach(result.references, id: \.self) { line in
                                Text("• \(line)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
                .padding(14)
                .background(DesignSystem.cardBackground)
                .cornerRadius(DesignSystem.cardCornerRadius)
                .padding(.horizontal, DesignSystem.padding)
            }
        }
    }
    
    @MainActor
    private func runCutoffAnalysis() async {
        analysisMessage = ""
        analysisResult = nil

        let yearText = analysisYear.trimmingCharacters(in: .whitespacesAndNewlines)
        let universityText = analysisUniversity.trimmingCharacters(in: .whitespacesAndNewlines)
        let majorText = analysisMajor.trimmingCharacters(in: .whitespacesAndNewlines)
        let scoreText = analysisScore.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let year = Int(yearText), year >= 2000, year <= 2100 else {
            analysisMessage = "학년도는 4자리 숫자로 입력해줘. (예: 2026)"
            return
        }
        guard !majorText.isEmpty else {
            analysisMessage = "학과명을 입력해줘."
            return
        }
        guard !universityText.isEmpty else {
            analysisMessage = "학교명을 입력해줘."
            return
        }
        guard parseNumber(scoreText) != nil else {
            analysisMessage = "점수(또는 틀린 개수)를 숫자로 입력해줘."
            return
        }

        analysisLoading = true
        analysisMessage = "생각 정리중..."
        defer { analysisLoading = false }

        do {
            let access = session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
            let response = try await api.analyzeRAGCutoff(
                baseURL: config.baseURL,
                exam: exam,
                year: year,
                university: universityText,
                major: majorText,
                score: scoreText,
                accessToken: access.isEmpty ? nil : access
            )

            if response.found {
                let status = response.status ?? ""
                let verdict = response.label?.isEmpty == false ? response.label! : verdictText(for: status)
                let detail = response.detail?.isEmpty == false
                    ? response.detail!
                    : (response.summary?.isEmpty == false ? response.summary! : "RAG 근거를 기준으로 결과를 정리했어.")
                let guide = response.targetGuide?.isEmpty == false
                    ? response.targetGuide!
                    : "부족한 영역을 보강해서 다시 점검해보자."
                let references = (response.basis ?? []).filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

                analysisResult = CutoffAnalysisResult(
                    verdict: verdict,
                    verdictColor: verdictColor(for: status),
                    basisLabel: "RAG 근거 기반",
                    detail: detail,
                    targetGuide: guide,
                    references: references
                )
                analysisMessage = response.summary ?? ""
            } else {
                analysisResult = nil
                analysisMessage =
                    response.message?.isEmpty == false
                    ? response.message!
                    : "아직 해당 정보가 존재하지않습니다. 빠른시일내에 준비하도록하겠습니다."
            }
        } catch {
            let fallback = "분석 요청에 실패했어. 잠시 후 다시 시도해줘."
            if let localized = (error as? LocalizedError)?.errorDescription, !localized.isEmpty {
                analysisMessage = localized
            } else {
                analysisMessage = fallback
            }
        }
    }

    private func parseNumber(_ value: String) -> Double? {
        let normalized = value
            .replacingOccurrences(of: ",", with: "")
            .replacingOccurrences(of: "점", with: "")
            .replacingOccurrences(of: "개", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return Double(normalized)
    }

    private func verdictColor(for status: String) -> Color {
        switch status {
        case "pass":
            return .green
        case "waitlist":
            return .orange
        case "fail":
            return .red
        default:
            return .secondary
        }
    }

    private func verdictText(for status: String) -> String {
        switch status {
        case "pass":
            return "합격권"
        case "waitlist":
            return "추합권"
        case "fail":
            return "불합격권"
        default:
            return "정보부족"
        }
    }

    // MARK: - Voting Modal
    private var voteSheetView: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("강사 투표하기")
                    .font(.headline)
                    .fontWeight(.bold)
                Spacer()
                Button(action: { showVoteSheet = false }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(.gray.opacity(0.5))
                }
            }
            .padding()
            .background(Color.white)
            
            ScrollView {
                VStack(spacing: 24) {
                    // Status Alert
                    if !session.isLoggedIn {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                            Text("로그인 후 투표할 수 있습니다.")
                                .font(.subheadline)
                                .foregroundColor(.orange)
                            Spacer()
                        }
                        .padding()
                        .background(Color.orange.opacity(0.1))
                        .cornerRadius(12)
                        .padding(.horizontal)
                    } else if let voteStatus, voteStatus.hasVoted {
                        HStack {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundColor(.green)
                            Text("이미 투표를 완료했습니다.")
                                .font(.subheadline)
                                .fontWeight(.bold)
                                .foregroundColor(.green)
                            Spacer()
                        }
                        .padding()
                        .background(Color.green.opacity(0.1))
                        .cornerRadius(12)
                        .padding(.horizontal)
                        
                        // Result Card
                        VStack(alignment: .leading, spacing: 12) {
                            Text("나의 투표 내역")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            
                            HStack {
                                Text(voteStatus.instructorName ?? "알 수 없음")
                                    .font(.title3)
                                    .fontWeight(.bold)
                                Spacer()
                                Text("강사님")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding()
                        .background(DesignSystem.cardBackground)
                        .cornerRadius(12)
                        .padding(.horizontal)
                    } else {
                        // Voting Form
                        VStack(spacing: 20) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("추천할 강사 선택")
                                    .font(.subheadline)
                                    .fontWeight(.bold)
                                    .foregroundColor(.secondary)
                                
                                if voteModeCustom {
                                    VStack(spacing: 12) {
                                        TextField("과목 (예: 편입수학)", text: $customSubject)
                                            .padding()
                                            .background(Color(.systemGray6))
                                            .cornerRadius(12)
                                        
                                        TextField("강사명 (예: 아름쌤)", text: $customInstructor)
                                            .padding()
                                            .background(Color(.systemGray6))
                                            .cornerRadius(12)
                                    }
                                } else {
                                    Menu {
                                        ForEach(rankings) { row in
                                            Button("\(row.subject) · \(row.instructorName)") {
                                                selectedInstructor = row.instructorName
                                            }
                                        }
                                    } label: {
                                        HStack {
                                            Text(selectedInstructor.isEmpty ? "강사를 선택해주세요" : selectedInstructor)
                                                .foregroundColor(selectedInstructor.isEmpty ? .gray : .primary)
                                            Spacer()
                                            Image(systemName: "chevron.up.chevron.down")
                                                .foregroundColor(.gray)
                                        }
                                        .padding()
                                        .background(Color(.systemGray6))
                                        .cornerRadius(12)
                                    }
                                }
                            }
                            
                            Toggle(isOn: $voteModeCustom) {
                                Text("목록에 없는 강사 직접 입력하기")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            .tint(DesignSystem.primary)
                        }
                        .padding()
                        .background(DesignSystem.cardBackground)
                        .cornerRadius(12)
                        .padding(.horizontal)
                    }
                    
                    if !voteMessage.isEmpty {
                        Text(voteMessage)
                            .font(.footnote)
                            .foregroundColor(voteMessage.contains("완료") ? .green : .red)
                            .padding(.horizontal)
                    }
                    
                    Spacer(minLength: 40)
                }
                .padding(.top, 20)
            }
            .background(DesignSystem.background)
            
            // Bottom Button
            if session.isLoggedIn && voteStatus?.hasVoted != true {
                VStack {
                    Button(action: {
                        Task { await vote() }
                    }) {
                        Text("1회 투표하기")
                            .font(.headline)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(DesignSystem.primary)
                            .cornerRadius(12)
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 20)
                    .padding(.top, 10)
                }
                .background(Color.white)
                .shadow(color: Color.black.opacity(0.05), radius: 5, x: 0, y: -5)
            } else {
                Spacer().frame(height: 20)
            }
        }
        .onAppear {
            if !rankings.isEmpty && selectedInstructor.isEmpty {
                selectedInstructor = rankings.first?.instructorName ?? ""
            }
        }
    }

    // MARK: - Data Tasks
    private func loadData(forceRefresh: Bool = false) async {
        if loading { return }
        loading = true
        errorMessage = ""
        let cachePolicy: URLRequest.CachePolicy = forceRefresh ? .reloadIgnoringLocalCacheData : .useProtocolCachePolicy

        do {
            async let cutoffsTask = api.fetchCutoffs(baseURL: config.baseURL, exam: exam, cachePolicy: cachePolicy)
            async let rankingTask = api.fetchRankings(baseURL: config.baseURL, exam: exam, cachePolicy: cachePolicy)
            
            let (cutoffResponse, rankingResponse) = try await (cutoffsTask, rankingTask)
            
            cutoffs = cutoffResponse.cutoffs
            rankings = rankingResponse.rankings
            communityStore.saveRankingSnapshot(exam: exam, rankings: rankings, cutoffs: cutoffs)
            
            if selectedInstructor.isEmpty {
                selectedInstructor = rankings.first?.instructorName ?? ""
            }

            await refreshVoteStatusIfNeeded(forceRefresh: forceRefresh)
        } catch {
            if APIClient.isCancellationError(error) {
                loading = false
                return
            }
            errorMessage = error.localizedDescription
        }

        loading = false
    }

    @discardableResult
    private func applyCachedSnapshotIfAvailable() -> Bool {
        guard let snapshot = communityStore.rankingSnapshot(exam: exam) else {
            return false
        }
        rankings = snapshot.rankings
        cutoffs = snapshot.cutoffs
        if selectedInstructor.isEmpty {
            selectedInstructor = rankings.first?.instructorName ?? ""
        }
        let age = Date().timeIntervalSince(snapshot.updatedAt)
        return age <= CommunityStore.rankingFreshWindow
    }

    private func refreshIfStale() {
        let fresh = applyCachedSnapshotIfAvailable()
        if fresh {
            Task { await refreshVoteStatusIfNeeded() }
            return
        }
        guard !loading else { return }
        let now = Date()
        guard now.timeIntervalSince(lastAutoRefreshAt) > 8 else { return }
        lastAutoRefreshAt = now
        Task { await loadData() }
    }

    private func refreshVoteStatusIfNeeded(forceRefresh: Bool = false) async {
        guard session.isLoggedIn else {
            voteStatus = nil
            return
        }
        let now = Date()
        if !forceRefresh {
            let statusFresh = now.timeIntervalSince(lastVoteStatusFetchAt) <= 60
            if statusFresh && voteStatus != nil {
                return
            }
        }
        voteStatus = try? await api.fetchVoteStatus(
            baseURL: config.baseURL,
            exam: exam,
            accessToken: session.accessToken
        )
        lastVoteStatusFetchAt = Date()
    }

    private func vote() async {
        let instructorName: String
        let subject: String?

        if voteModeCustom {
            instructorName = customInstructor.trimmingCharacters(in: .whitespacesAndNewlines)
            subject = customSubject.trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            instructorName = selectedInstructor.trimmingCharacters(in: .whitespacesAndNewlines)
            subject = nil
        }

        guard !instructorName.isEmpty else {
            voteMessage = "강사명을 입력해 주세요."
            return
        }

        do {
            let status = try await api.vote(
                baseURL: config.baseURL,
                exam: exam,
                accessToken: session.accessToken,
                instructorName: instructorName,
                subject: subject
            )
            voteStatus = status
            voteMessage = "투표 완료"
            await loadData(forceRefresh: true)
        } catch {
            voteMessage = error.localizedDescription
        }
    }
}
