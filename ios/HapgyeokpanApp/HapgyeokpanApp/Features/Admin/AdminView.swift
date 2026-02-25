import SwiftUI

struct AdminView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore

    private let api = APIClient()

    @State private var exam: ExamSlug = .transfer
    @State private var adminState: AdminMeResponse?

    @State private var rankings: [AdminRankingItem] = []
    @State private var cutoffs: [AdminCutoffItem] = []

    @State private var subject = ""
    @State private var instructorName = ""

    @State private var university = ""
    @State private var major = ""
    @State private var year = "2026"
    @State private var track = "general"
    @State private var inputBasis = "wrong"
    @State private var waitlist = ""
    @State private var initial = ""
    @State private var memo = ""

    @State private var message = ""
    @State private var loading = false

    var body: some View {
        List {
            if loading {
                ProgressView("불러오는 중...")
            }

            if let adminState, !adminState.isAdmin {
                Section("관리자 권한") {
                    Text("현재 계정은 관리자 권한이 없습니다.")
                    if adminState.canBootstrap {
                        Button("내 계정 관리자 등록") {
                            Task { await bootstrap() }
                        }
                    }
                }
            }

            if adminState?.isAdmin == true {
                Section("강사 추가") {
                    TextField("과목", text: $subject)
                    TextField("강사명", text: $instructorName)
                    Button("저장") {
                        Task { await addRanking() }
                    }
                }

                Section("강사 목록") {
                    ForEach(rankings) { row in
                        HStack {
                            VStack(alignment: .leading) {
                                Text("\(row.rank)위 \(row.instructorName)")
                                Text("\(row.subject) · 득표 \(row.voteCount)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(role: .destructive) {
                                Task { await deleteRanking(id: row.id) }
                            } label: {
                                Text("삭제")
                            }
                        }
                    }
                }

                Section("커트라인 추가") {
                    TextField("학교", text: $university)
                    TextField("전공", text: $major)
                    TextField("년도", text: $year)
                        .keyboardType(.numberPad)

                    Picker("전형", selection: $track) {
                        Text("일반").tag("general")
                        Text("학사").tag("academic")
                    }
                    Picker("입력기준", selection: $inputBasis) {
                        Text("틀린개수").tag("wrong")
                        Text("점수").tag("score")
                    }

                    TextField("추합권 컷", text: $waitlist)
                        .keyboardType(.decimalPad)
                    TextField("최초합권 컷", text: $initial)
                        .keyboardType(.decimalPad)
                    TextField("메모", text: $memo)

                    Button("커트라인 저장") {
                        Task { await saveCutoff() }
                    }
                }

                Section("커트라인 목록") {
                    ForEach(cutoffs) { row in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(row.university) \(row.major) \(row.year)")
                                    .font(.subheadline.bold())
                                Text("\(row.track) · \(row.inputBasis)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(role: .destructive) {
                                Task { await deleteCutoff(id: row.id) }
                            } label: {
                                Text("삭제")
                            }
                        }
                    }
                }
            }

            if !message.isEmpty {
                Section {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(message.contains("실패") || message.contains("오류") ? .red : .green)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("관리자")
        .task {
            await loadData()
        }
        .refreshable {
            await loadData()
        }
    }

    private func loadData() async {
        loading = true
        message = ""

        do {
            let me = try await api.fetchAdminMe(baseURL: config.baseURL, accessToken: session.accessToken)
            adminState = me

            guard me.isAdmin else {
                rankings = []
                cutoffs = []
                loading = false
                return
            }

            async let rankingTask = api.fetchAdminRankings(baseURL: config.baseURL, exam: exam, accessToken: session.accessToken)
            async let cutoffTask = api.fetchAdminCutoffs(baseURL: config.baseURL, exam: exam, accessToken: session.accessToken)

            let (rankingResponse, cutoffResponse) = try await (rankingTask, cutoffTask)
            rankings = rankingResponse.rankings
            cutoffs = cutoffResponse.cutoffs
        } catch {
            message = error.localizedDescription
        }

        loading = false
    }

    private func bootstrap() async {
        do {
            try await api.bootstrapAdmin(baseURL: config.baseURL, accessToken: session.accessToken)
            message = "관리자 등록 완료"
            await loadData()
        } catch {
            message = error.localizedDescription
        }
    }

    private func addRanking() async {
        guard !subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !instructorName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            message = "과목과 강사명을 입력해 주세요."
            return
        }

        do {
            let response = try await api.addAdminRanking(
                baseURL: config.baseURL,
                exam: exam,
                accessToken: session.accessToken,
                subject: subject,
                instructorName: instructorName,
                initialRank: nil,
                initialVotes: 0
            )
            rankings = response.rankings
            subject = ""
            instructorName = ""
            message = "저장 완료"
        } catch {
            message = error.localizedDescription
        }
    }

    private func deleteRanking(id: String) async {
        do {
            let response = try await api.deleteAdminRanking(
                baseURL: config.baseURL,
                exam: exam,
                id: id,
                accessToken: session.accessToken
            )
            rankings = response.rankings
            message = "삭제 완료"
        } catch {
            message = error.localizedDescription
        }
    }

    private func saveCutoff() async {
        guard !university.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !major.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let yearInt = Int(year) else {
            message = "학교/전공/년도를 확인해 주세요."
            return
        }

        let wait = Double(waitlist)
        let initialValue = Double(initial)

        do {
            let response = try await api.upsertAdminCutoff(
                baseURL: config.baseURL,
                exam: exam,
                accessToken: session.accessToken,
                university: university,
                major: major,
                year: yearInt,
                track: track,
                inputBasis: inputBasis,
                waitlistCutoff: wait,
                initialCutoff: initialValue,
                memo: memo
            )
            cutoffs = response.cutoffs
            major = ""
            waitlist = ""
            initial = ""
            memo = ""
            message = "커트라인 저장 완료"
        } catch {
            message = error.localizedDescription
        }
    }

    private func deleteCutoff(id: String) async {
        do {
            let response = try await api.deleteAdminCutoff(
                baseURL: config.baseURL,
                exam: exam,
                id: id,
                accessToken: session.accessToken
            )
            cutoffs = response.cutoffs
            message = "커트라인 삭제 완료"
        } catch {
            message = error.localizedDescription
        }
    }
}
