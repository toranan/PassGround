import PhotosUI
import SwiftUI

struct VerificationView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore

    @Environment(\.presentationMode) var presentationMode

    private let api = APIClient()

    @State private var exam: ExamSlug = .transfer
    @State private var verificationType = "transfer_passer"
    @State private var memo = ""

    @State private var selectedPhoto: PhotosPickerItem?
    @State private var imageData: Data?
    @State private var uploadedURL = ""

    @State private var message = ""
    @State private var submitting = false
    @State private var isUploading = false

    var body: some View {
        VStack(spacing: 0) {
            // Custom Navigation Bar
            HStack {
                Button(action: {
                    presentationMode.wrappedValue.dismiss()
                }) {
                    Image(systemName: "chevron.left")
                        .font(.title3)
                        .foregroundColor(.primary)
                        .padding(.trailing, 8)
                }
                
                Text("합격증 인증 신청")
                    .font(.headline)
                    .fontWeight(.bold)
                
                Spacer()
            }
            .padding()
            .background(Color.white)
            
            ScrollView {
                VStack(spacing: 20) {
                    // Applicant Section
                    VStack(alignment: .leading, spacing: 8) {
                        Text("신청자 정보")
                            .font(.subheadline)
                            .fontWeight(.bold)
                            .foregroundColor(.secondary)
                        
                        HStack {
                            Text(session.displayName.isEmpty ? "로그인 필요" : session.displayName)
                                .font(.body)
                                .foregroundColor(.primary)
                            Spacer()
                        }
                        .padding()
                        .background(DesignSystem.cardBackground)
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)

                    // Verification Type Section
                    VStack(alignment: .leading, spacing: 8) {
                        Text("인증 유형")
                            .font(.subheadline)
                            .fontWeight(.bold)
                            .foregroundColor(.secondary)
                        
                        HStack {
                            Picker("고드름", selection: $verificationType) {
                                Text("편입 합격증").tag("transfer_passer")
                                Text("최초/추합 증빙").tag("transfer_finalist")
                            }
                            .pickerStyle(SegmentedPickerStyle())
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .background(DesignSystem.cardBackground)
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)

                    // Evidence Image Section
                    VStack(alignment: .leading, spacing: 8) {
                        Text("증빙 자료")
                            .font(.subheadline)
                            .fontWeight(.bold)
                            .foregroundColor(.secondary)
                        
                        VStack(spacing: 12) {
                            if let uiImage = imageData.flatMap({ UIImage(data: $0) }) {
                                Image(uiImage: uiImage)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(maxWidth: .infinity, maxHeight: 200)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                                    )
                                
                                Button(action: {
                                    imageData = nil
                                    selectedPhoto = nil
                                    uploadedURL = ""
                                }) {
                                    Text("다시 선택하기")
                                        .font(.caption)
                                        .foregroundColor(.red)
                                }
                            } else {
                                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                                    VStack(spacing: 12) {
                                        Image(systemName: "camera.fill")
                                            .font(.system(size: 32))
                                            .foregroundColor(.gray)
                                        Text("여기를 터치하여 이미지를 선택해주세요")
                                            .font(.callout)
                                            .foregroundColor(.gray)
                                        Text("주민번호 뒷자리 상단 노출 시 인증이 거절됩니다.")
                                            .font(.caption2)
                                            .foregroundColor(.red.opacity(0.8))
                                    }
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 40)
                                    .background(Color(.systemGray6))
                                    .cornerRadius(12)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5]))
                                            .foregroundColor(.gray.opacity(0.5))
                                    )
                                }
                            }
                            
                            if imageData != nil && uploadedURL.isEmpty {
                                Button(action: {
                                    Task { await uploadEvidence() }
                                }) {
                                    if isUploading {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle())
                                            .tint(DesignSystem.primary)
                                    } else {
                                        Text("이미지 서버에 올리기")
                                            .font(.subheadline)
                                            .fontWeight(.bold)
                                            .foregroundColor(DesignSystem.primary)
                                            .frame(maxWidth: .infinity)
                                            .padding()
                                            .background(DesignSystem.primary.opacity(0.1))
                                            .cornerRadius(12)
                                    }
                                }
                                .disabled(isUploading)
                            }
                            
                            if !uploadedURL.isEmpty {
                                HStack {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.green)
                                    Text("이미지 업로드 완료")
                                        .font(.caption)
                                        .foregroundColor(.green)
                                    Spacer()
                                }
                            }
                        }
                        .padding()
                        .background(DesignSystem.cardBackground)
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)

                    // Memo Section
                    VStack(alignment: .leading, spacing: 8) {
                        Text("참고 메모 (선택)")
                            .font(.subheadline)
                            .fontWeight(.bold)
                            .foregroundColor(.secondary)
                        
                        TextField("관리자가 확인할 참고사항을 적어주세요. (예: 22학년도 합격생입니다)", text: $memo, axis: .vertical)
                            .lineLimit(4...6)
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                    }
                    .padding(.horizontal)
                    
                    if !message.isEmpty {
                        Text(message)
                            .font(.footnote)
                            .foregroundColor(message.contains("접수") ? .green : .red)
                            .padding(.horizontal)
                    }

                    Spacer(minLength: 40)
                }
                .padding(.vertical)
            }
            .background(DesignSystem.background)

            // Bottom Submit Button
            VStack {
                Button(action: {
                    Task { await submit() }
                }) {
                    Text(submitting ? "제출 중..." : "인증 신청하기")
                        .font(.headline)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(
                            (imageData == nil || uploadedURL.isEmpty || submitting) 
                            ? Color.gray.opacity(0.5) 
                            : DesignSystem.primary
                        )
                        .cornerRadius(12)
                }
                .disabled(imageData == nil || uploadedURL.isEmpty || submitting)
                .padding(.horizontal)
                .padding(.bottom, 20)
                .padding(.top, 10)
            }
            .background(Color.white)
            .shadow(color: Color.black.opacity(0.05), radius: 5, x: 0, y: -5)
        }
        .navigationBarHidden(true)
        .onChange(of: selectedPhoto) { item in
            Task {
                guard let item else { return }
                imageData = try? await item.loadTransferable(type: Data.self)
                uploadedURL = "" // Reset URL when new image selected
            }
        }
    }

    private func uploadEvidence() async {
        guard let data = imageData else {
            message = "이미지를 선택해 주세요."
            return
        }

        isUploading = true
        message = ""
        do {
            uploadedURL = try await api.upload(
                baseURL: config.baseURL,
                data: data,
                filename: "verification-\(Int(Date().timeIntervalSince1970)).jpg",
                mimeType: "image/jpeg",
                usage: "verification"
            )
            message = "업로드 완료"
        } catch {
            message = error.localizedDescription
            uploadedURL = ""
        }
        isUploading = false
    }

    private func submit() async {
        guard session.isLoggedIn else {
            message = "로그인 후 신청할 수 있습니다."
            return
        }
        guard !uploadedURL.isEmpty else {
            message = "증빙 이미지를 먼저 업로드해 주세요."
            return
        }

        submitting = true
        do {
            try await api.requestVerification(
                baseURL: config.baseURL,
                userId: session.user?.id,
                requesterName: session.displayName,
                exam: exam,
                verificationType: verificationType,
                evidenceURL: uploadedURL,
                memo: memo
            )
            message = "인증 신청이 접수되었습니다."
            uploadedURL = ""
            imageData = nil
            selectedPhoto = nil
            memo = ""
        } catch {
            message = error.localizedDescription
        }
        submitting = false
    }
}

private let schedulePrimary = Color(red: 20/255, green: 83/255, blue: 45/255)
private let scheduleLocalAccent = Color(red: 37/255, green: 99/255, blue: 235/255)
private let scheduleSheetStart = Color(red: 24/255, green: 105/255, blue: 62/255)
private let scheduleSheetEnd = Color(red: 58/255, green: 156/255, blue: 98/255)

private struct LocalScheduleItem: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let category: String
    let startsAt: Date
    let endsAt: Date?
    let location: String?
    let note: String?
}

private struct ScheduleEntry: Identifiable, Equatable {
    let id: String
    let title: String
    let category: String
    let startsAt: Date
    let endsAt: Date?
    let location: String?
    let organizer: String?
    let linkUrl: String?
    let note: String?
    let isOfficial: Bool
    let isLocal: Bool
}

private struct ScheduleMonthGroup: Identifiable {
    let id: String
    let title: String
    let anchor: Date
    let items: [ScheduleEntry]
}

private enum ScheduleBucket: String, CaseIterable, Identifiable {
    case calendar = "달력"
    case official = "주요 일정"

    var id: String { rawValue }
}

private struct LocalScheduleDraft {
    var title: String = ""
    var time: Date = Date()
    var note: String = ""
}

struct ScheduleView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var communityStore: CommunityStore
    @Environment(\.scenePhase) private var scenePhase

    private let api = APIClient()

    @State private var exam: ExamSlug = .transfer
    @State private var officialSchedules: [ExamScheduleItem] = []
    @State private var localSchedules: [LocalScheduleItem] = []
    @State private var completedIDs: Set<String> = []
    @State private var loading = false
    @State private var errorMessage = ""
    @State private var didBootstrap = false
    @State private var lastAutoRefreshAt = Date.distantPast
    @State private var showingLocalScheduleSheet = false
    @State private var localScheduleDraft = LocalScheduleDraft()
    @State private var selectedBucket: ScheduleBucket = .calendar
    @State private var selectedDate: Date? = Date()
    @State private var visibleMonth = ScheduleView.startOfMonth(for: Date())

    private var completionKey: String {
        "schedule_completed_ids_\(exam.rawValue)"
    }

    private var localScheduleKey: String {
        "schedule_local_items_\(exam.rawValue)"
    }

    private var mergedEntries: [ScheduleEntry] {
        let official = officialSchedules.map { item in
            ScheduleEntry(
                id: item.id,
                title: item.title,
                category: item.category,
                startsAt: Self.parseDate(item.startsAt) ?? .distantFuture,
                endsAt: Self.parseDate(item.endsAt),
                location: item.location,
                organizer: item.organizer,
                linkUrl: item.linkUrl,
                note: item.note,
                isOfficial: item.isOfficial,
                isLocal: false
            )
        }

        let local = localSchedules.map { item in
            ScheduleEntry(
                id: item.id,
                title: item.title,
                category: item.category,
                startsAt: item.startsAt,
                endsAt: item.endsAt,
                location: item.location,
                organizer: nil,
                linkUrl: nil,
                note: item.note,
                isOfficial: false,
                isLocal: true
            )
        }

        return (official + local).sorted {
            if $0.startsAt != $1.startsAt { return $0.startsAt < $1.startsAt }
            return $0.title < $1.title
        }
    }

    private var officialEntries: [ScheduleEntry] {
        mergedEntries.filter { $0.isOfficial }
    }

    private var officialMonthGroups: [ScheduleMonthGroup] {
        let grouped = Dictionary(grouping: officialEntries) { item in
            Self.monthHeader.string(from: item.startsAt)
        }

        let groups = grouped.map { key, items -> ScheduleMonthGroup in
            let sorted = items.sorted { $0.startsAt < $1.startsAt }
            return ScheduleMonthGroup(
                id: key,
                title: key,
                anchor: sorted.first?.startsAt ?? .distantFuture,
                items: sorted
            )
        }

        return groups.sorted { $0.anchor < $1.anchor }
    }

    private var calendarDayEntries: [ScheduleEntry] {
        guard let selectedDate else { return [] }
        return mergedEntries.filter {
            Calendar.current.isDate($0.startsAt, inSameDayAs: selectedDate)
        }
    }

    private var scheduleDotDays: Set<Date> {
        Set(mergedEntries.map { Calendar.current.startOfDay(for: $0.startsAt) })
    }

    private var calendarGridDates: [Date?] {
        Self.monthGridDates(for: visibleMonth)
    }

    private var weekdaySymbols: [String] {
        Self.weekdaySymbols()
    }

    private var canAddSchedule: Bool {
        selectedDate != nil
    }

    private var headerEntries: [ScheduleEntry] {
        selectedBucket == .official ? officialEntries : mergedEntries
    }

    private var completedCount: Int {
        headerEntries.filter { completedIDs.contains($0.id) }.count
    }

    private var nextUpcoming: ScheduleEntry? {
        let now = Date()
        return headerEntries.first { ($0.endsAt ?? $0.startsAt) >= now }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                headerCard
                bucketPicker

                if loading && headerEntries.isEmpty {
                    ProgressView("일정을 불러오는 중...")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(30)
                }

                if !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                }

                if !loading && headerEntries.isEmpty {
                    Text(selectedBucket == .official ? "등록된 주요 일정이 없습니다." : "등록된 일정이 없습니다.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                }

                if selectedBucket == .calendar {
                    calendarSection
                } else {
                    officialSection
                }
            }
            .padding(.vertical, 14)
        }
        .background(Color(UIColor.systemGroupedBackground))
        .navigationTitle("일정")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingLocalScheduleSheet) {
            localScheduleSheet
        }
        .task {
            guard !didBootstrap else { return }
            didBootstrap = true
            loadCompletedIDs()
            loadLocalSchedules()
            let fresh = applyCachedSnapshotIfAvailable()
            if !fresh {
                await loadSchedules()
            }
            pruneCompletedIDs()
        }
        .onAppear {
            refreshIfStale()
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active {
                refreshIfStale()
            }
        }
        .onChange(of: selectedDate) { newDate in
            guard let newDate else { return }
            let month = Self.startOfMonth(for: newDate)
            if !Calendar.current.isDate(month, equalTo: visibleMonth, toGranularity: .month) {
                visibleMonth = month
            }
        }
        .refreshable {
            await loadSchedules(forceRefresh: true)
        }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("편입 일정 관리")
                .font(.title3)
                .fontWeight(.bold)
                .foregroundStyle(.white)

            Text("완료 \(completedCount) / 전체 \(headerEntries.count)")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.9))

            if let nextUpcoming {
                Text("다음 일정: \(nextUpcoming.title) (\(ddayText(for: nextUpcoming)))")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.9))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            LinearGradient(
                colors: [schedulePrimary, schedulePrimary.opacity(0.8)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
    }

    private var bucketPicker: some View {
        Picker("일정 종류", selection: $selectedBucket) {
            ForEach(ScheduleBucket.allCases) { bucket in
                Text(bucket.rawValue).tag(bucket)
            }
        }
        .pickerStyle(.segmented)
        .tint(schedulePrimary)
        .padding(.horizontal, 16)
    }

    private var calendarSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(spacing: 10) {
                HStack {
                    Button {
                        moveMonth(by: -1)
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(schedulePrimary)
                            .padding(6)
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    Text(Self.monthHeader.string(from: visibleMonth))
                        .font(.headline.weight(.bold))

                    Spacer()

                    Button {
                        moveMonth(by: 1)
                    } label: {
                        Image(systemName: "chevron.right")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(schedulePrimary)
                            .padding(6)
                    }
                    .buttonStyle(.plain)
                }

                let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(weekdaySymbols, id: \.self) { symbol in
                        Text(symbol)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                    }

                    ForEach(Array(calendarGridDates.enumerated()), id: \.offset) { _, date in
                        if let date {
                            let isSelected = selectedDate.map { Calendar.current.isDate(date, inSameDayAs: $0) } ?? false
                            let isToday = Calendar.current.isDateInToday(date)
                            let hasEvent = scheduleDotDays.contains(Calendar.current.startOfDay(for: date))

                            Button {
                                selectedDate = date
                            } label: {
                                VStack(spacing: 3) {
                                    Text("\(Calendar.current.component(.day, from: date))")
                                        .font(.subheadline.weight(isSelected ? .bold : .regular))
                                        .foregroundStyle(isSelected ? .white : .primary)
                                        .frame(maxWidth: .infinity)

                                    Circle()
                                        .fill(isSelected ? Color.white : schedulePrimary)
                                        .frame(width: 5, height: 5)
                                        .opacity(hasEvent ? 1 : 0)
                                }
                                .frame(height: 42)
                                .frame(maxWidth: .infinity)
                                .background(
                                    Group {
                                        if isSelected {
                                            RoundedRectangle(cornerRadius: 10).fill(schedulePrimary)
                                        } else if isToday {
                                            RoundedRectangle(cornerRadius: 10)
                                                .stroke(schedulePrimary.opacity(0.45), lineWidth: 1)
                                        } else {
                                            RoundedRectangle(cornerRadius: 10).fill(Color.clear)
                                        }
                                    }
                                )
                                .overlay(alignment: .topTrailing) {
                                    if isToday {
                                        Text("today")
                                            .font(.system(size: 8, weight: .semibold))
                                            .foregroundStyle(isSelected ? Color.white.opacity(0.9) : schedulePrimary.opacity(0.88))
                                            .padding(.top, 2)
                                            .padding(.trailing, 4)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        } else {
                            Color.clear
                                .frame(height: 42)
                        }
                    }
                }
            }
            .padding(12)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(schedulePrimary.opacity(0.14), lineWidth: 1)
            )
            .padding(.horizontal, 16)

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(selectedDate.map { "\(Self.dayHeader.string(from: $0)) 일정" } ?? "날짜를 선택해줘")
                        .font(.headline)
                        .fontWeight(.bold)
                    Spacer()
                    Button {
                        beginAddLocalScheduleForSelectedDate()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "plus")
                            Text("일정추가")
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(canAddSchedule ? schedulePrimary : Color(.systemGray4))
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(!canAddSchedule)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(schedulePrimary.opacity(0.14), lineWidth: 1)
                )
                .padding(.horizontal, 16)

                if selectedDate == nil {
                    Text("달력에서 날짜를 눌러줘.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 16)
                } else if calendarDayEntries.isEmpty {
                    Text("선택한 날짜의 일정이 없습니다.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 16)
                } else {
                    VStack(spacing: 10) {
                        ForEach(calendarDayEntries) { item in
                            scheduleCard(item)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
        }
    }

    private var officialSection: some View {
        VStack(spacing: 12) {
            ForEach(officialMonthGroups) { group in
                VStack(alignment: .leading, spacing: 10) {
                    Text(group.title)
                        .font(.headline)
                        .fontWeight(.bold)
                        .padding(.horizontal, 16)

                    VStack(spacing: 10) {
                        ForEach(group.items) { item in
                            scheduleCard(item)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
        }
    }

    private func scheduleCard(_ item: ScheduleEntry) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 8) {
                Button {
                    toggleCompleted(id: item.id)
                } label: {
                    Image(systemName: completedIDs.contains(item.id) ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(completedIDs.contains(item.id) ? schedulePrimary : .gray)
                }
                .buttonStyle(.plain)

                Text(item.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .strikethrough(completedIDs.contains(item.id), color: .secondary)

                Spacer()

                Text(ddayText(for: item))
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(schedulePrimary)

                if item.isLocal {
                    Button(role: .destructive) {
                        deleteLocalSchedule(id: item.id)
                    } label: {
                        Image(systemName: "trash")
                            .font(.caption)
                    }
                    .buttonStyle(.plain)
                }
            }

            HStack(spacing: 8) {
                Text(item.category)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color(.systemGray6))
                    .clipShape(Capsule())

                if item.isOfficial {
                    Text("주요")
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(schedulePrimary)
                        .clipShape(Capsule())
                } else if item.isLocal {
                    Text("내 일정")
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(scheduleLocalAccent)
                        .clipShape(Capsule())
                }
            }

            Text(dateLabel(item))
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if let location = item.location, !location.isEmpty {
                Label(location, systemImage: "mappin.and.ellipse")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let organizer = item.organizer, !organizer.isEmpty {
                Label(organizer, systemImage: "building.2")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let note = item.note, !note.isEmpty {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let link = item.linkUrl, let url = URL(string: link), item.isOfficial {
                Link(destination: url) {
                    Label("공식 공지 보기", systemImage: "link")
                        .font(.caption)
                        .fontWeight(.semibold)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(item.isOfficial ? schedulePrimary.opacity(0.05) : scheduleLocalAccent.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(item.isOfficial ? schedulePrimary.opacity(0.2) : scheduleLocalAccent.opacity(0.2), lineWidth: 1)
        )
    }

    private func loadSchedules(forceRefresh: Bool = false) async {
        if loading { return }
        loading = true
        errorMessage = ""

        let cachePolicy: URLRequest.CachePolicy = forceRefresh ? .reloadIgnoringLocalCacheData : .useProtocolCachePolicy
        let cacheBust = forceRefresh ? String(Int(Date().timeIntervalSince1970)) : nil

        do {
            let response = try await api.fetchSchedules(
                baseURL: config.baseURL,
                exam: exam,
                cachePolicy: cachePolicy,
                cacheBust: cacheBust
            )
            officialSchedules = response.schedules
            communityStore.saveScheduleSnapshot(exam: exam, schedules: response.schedules)
            pruneCompletedIDs()
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
        guard let snapshot = communityStore.scheduleSnapshot(exam: exam) else {
            return false
        }
        officialSchedules = snapshot.schedules
        errorMessage = ""
        pruneCompletedIDs()
        let age = Date().timeIntervalSince(snapshot.updatedAt)
        return age <= CommunityStore.scheduleFreshWindow
    }

    private func refreshIfStale() {
        let fresh = applyCachedSnapshotIfAvailable()
        guard !fresh, !loading else { return }
        let now = Date()
        guard now.timeIntervalSince(lastAutoRefreshAt) > 8 else { return }
        lastAutoRefreshAt = now
        Task { await loadSchedules() }
    }

    private func loadCompletedIDs() {
        let value = UserDefaults.standard.string(forKey: completionKey) ?? ""
        completedIDs = Set(
            value
                .split(separator: ",")
                .map(String.init)
                .filter { !$0.isEmpty }
        )
    }

    private func persistCompletedIDs() {
        let value = completedIDs.sorted().joined(separator: ",")
        UserDefaults.standard.set(value, forKey: completionKey)
    }

    private func toggleCompleted(id: String) {
        if completedIDs.contains(id) {
            completedIDs.remove(id)
        } else {
            completedIDs.insert(id)
        }
        persistCompletedIDs()
    }

    private func loadLocalSchedules() {
        guard let data = UserDefaults.standard.data(forKey: localScheduleKey),
              let items = try? JSONDecoder().decode([LocalScheduleItem].self, from: data) else {
            localSchedules = []
            return
        }
        localSchedules = items.sorted { $0.startsAt < $1.startsAt }
    }

    private func persistLocalSchedules() {
        guard let data = try? JSONEncoder().encode(localSchedules) else { return }
        UserDefaults.standard.set(data, forKey: localScheduleKey)
    }

    private func saveLocalSchedule() {
        let title = localScheduleDraft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        guard let selectedDate else { return }

        let calendar = Calendar.current
        let day = calendar.dateComponents([.year, .month, .day], from: selectedDate)
        let time = calendar.dateComponents([.hour, .minute], from: localScheduleDraft.time)
        let startsAt = calendar.date(
            from: DateComponents(
                year: day.year,
                month: day.month,
                day: day.day,
                hour: time.hour ?? 9,
                minute: time.minute ?? 0
            )
        ) ?? selectedDate

        let item = LocalScheduleItem(
            id: "local-\(UUID().uuidString)",
            title: title,
            category: "내 일정",
            startsAt: startsAt,
            endsAt: nil,
            location: nil,
            note: localScheduleDraft.note.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        )

        localSchedules.append(item)
        localSchedules.sort { $0.startsAt < $1.startsAt }
        persistLocalSchedules()
        pruneCompletedIDs()
        showingLocalScheduleSheet = false
    }

    private func beginAddLocalScheduleForSelectedDate() {
        guard selectedDate != nil else { return }
        var draft = LocalScheduleDraft()
        let calendar = Calendar.current
        let nowTime = calendar.dateComponents([.hour, .minute], from: Date())
        draft.time = calendar.date(
            from: DateComponents(
                hour: nowTime.hour ?? 9,
                minute: nowTime.minute ?? 0
            )
        ) ?? Date()
        localScheduleDraft = draft
        showingLocalScheduleSheet = true
    }

    private func moveMonth(by offset: Int) {
        guard let month = Calendar.current.date(byAdding: .month, value: offset, to: visibleMonth) else {
            return
        }
        let newMonth = Self.startOfMonth(for: month)
        visibleMonth = newMonth
        selectedDate = nil
    }

    private func deleteLocalSchedule(id: String) {
        localSchedules.removeAll { $0.id == id }
        completedIDs.remove(id)
        persistCompletedIDs()
        persistLocalSchedules()
        pruneCompletedIDs()
    }

    private func pruneCompletedIDs() {
        let validIDs = Set(mergedEntries.map { $0.id })
        let filtered = completedIDs.intersection(validIDs)
        if filtered != completedIDs {
            completedIDs = filtered
            persistCompletedIDs()
        }
    }

    private var localScheduleSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("선택 날짜")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.92))
                        Text(Self.dayHeader.string(from: selectedDate ?? visibleMonth))
                            .font(.headline)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(
                        LinearGradient(
                            colors: [scheduleSheetStart, scheduleSheetEnd],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                    VStack(alignment: .leading, spacing: 12) {
                        Text("일정 제목")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        TextField("예: 편입영어 단어 복습", text: $localScheduleDraft.title)
                            .textFieldStyle(.plain)
                            .font(.body.weight(.semibold))

                        Divider()

                        HStack {
                            Text("시간")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Spacer()
                            DatePicker(
                                "",
                                selection: $localScheduleDraft.time,
                                displayedComponents: [.hourAndMinute]
                            )
                            .labelsHidden()
                            .datePickerStyle(.compact)
                        }

                        Divider()

                        Text("상세")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        TextField("상세", text: $localScheduleDraft.note, axis: .vertical)
                            .lineLimit(2...4)
                            .textFieldStyle(.plain)
                    }
                    .padding(14)
                    .background(Color.white.opacity(0.94))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(scheduleSheetEnd.opacity(0.2), lineWidth: 1)
                    )

                    Button {
                        saveLocalSchedule()
                    } label: {
                        Text("일정 추가")
                            .font(.headline)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(
                                Group {
                                    if localScheduleDraft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Color.gray.opacity(0.5)
                                    } else {
                                        LinearGradient(
                                            colors: [scheduleSheetStart, scheduleSheetEnd],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    }
                                }
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .shadow(
                                color: localScheduleDraft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                ? .clear
                                : scheduleSheetStart.opacity(0.28),
                                radius: 10,
                                x: 0,
                                y: 6
                            )
                    }
                    .disabled(localScheduleDraft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .top)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(
                LinearGradient(
                    colors: [Color(red: 245/255, green: 250/255, blue: 247/255), Color.white],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .navigationTitle("일정추가")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("취소") {
                        showingLocalScheduleSheet = false
                    }
                }
            }
        }
    }

    private func dateLabel(_ item: ScheduleEntry) -> String {
        let start = Self.displayDate.string(from: item.startsAt)
        guard let endsAt = item.endsAt else { return start }
        return "\(start) ~ \(Self.displayDate.string(from: endsAt))"
    }

    private func ddayText(for item: ScheduleEntry) -> String {
        let target = Calendar.current.startOfDay(for: item.startsAt)
        let today = Calendar.current.startOfDay(for: Date())
        let diff = Calendar.current.dateComponents([.day], from: today, to: target).day ?? 0
        if diff == 0 { return "D-Day" }
        if diff > 0 { return "D-\(diff)" }
        return "D+\(abs(diff))"
    }

    private static let monthHeader: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "yyyy년 M월"
        return formatter
    }()

    private static let displayDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M월 d일(E) HH:mm"
        return formatter
    }()

    private static let dayHeader: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M월 d일(E)"
        return formatter
    }()

    private static func startOfMonth(for date: Date) -> Date {
        let calendar = Calendar.current
        let components = calendar.dateComponents([.year, .month], from: date)
        return calendar.date(from: components) ?? date
    }

    private static func monthGridDates(for month: Date) -> [Date?] {
        let calendar = Calendar.current
        let start = startOfMonth(for: month)
        let firstWeekday = calendar.component(.weekday, from: start)
        let leading = (firstWeekday - calendar.firstWeekday + 7) % 7
        let dayCount = calendar.range(of: .day, in: .month, for: start)?.count ?? 30

        var values: [Date?] = Array(repeating: nil, count: leading)
        values.reserveCapacity(leading + dayCount + 6)

        let base = calendar.dateComponents([.year, .month], from: start)
        for day in 1...dayCount {
            var components = base
            components.day = day
            values.append(calendar.date(from: components))
        }

        while values.count % 7 != 0 {
            values.append(nil)
        }
        return values
    }

    private static func weekdaySymbols() -> [String] {
        let calendar = Calendar.current
        var symbols = calendar.veryShortStandaloneWeekdaySymbols
        if symbols.isEmpty {
            symbols = ["일", "월", "화", "수", "목", "금", "토"]
        }

        let firstIndex = max(0, min(symbols.count - 1, calendar.firstWeekday - 1))
        if firstIndex == 0 { return symbols }
        return Array(symbols[firstIndex...]) + Array(symbols[..<firstIndex])
    }

    private static func parseDate(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }

        let isoWithFraction = ISO8601DateFormatter()
        isoWithFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoWithFraction.date(from: value) { return date }

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        if let date = iso.date(from: value) { return date }

        let fallback = DateFormatter()
        fallback.locale = Locale(identifier: "en_US_POSIX")
        fallback.dateFormat = "yyyy-MM-dd HH:mm:ss"
        fallback.timeZone = TimeZone(secondsFromGMT: 0)
        if let date = fallback.date(from: value) { return date }

        return nil
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
