import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

private struct LocalAttachment: Identifiable {
    let id = UUID()
    let data: Data
    let filename: String
    let mimeType: String
    let isImage: Bool
}

struct PostComposerView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore

    private let api = APIClient()

    let exam: ExamSlug
    let boardSlug: String

    @State private var title = ""
    @State private var content = ""

    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var attachments: [LocalAttachment] = []
    @State private var showFileImporter = false

    @State private var isSubmitting = false
    @State private var message = ""

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("익명 글쓰기")
                        .font(.title3.bold())
                    Text("작성자 실명은 노출되지 않습니다.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text("작성자: \(session.displayName.isEmpty ? "익명" : session.displayName)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(14)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .listRowSeparator(.hidden)

            Section("제목") {
                TextField("제목을 입력하세요", text: $title)
                    .textFieldStyle(.plain)
                    .padding(10)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .listRowSeparator(.hidden)

            Section("내용") {
                TextEditor(text: $content)
                    .frame(minHeight: 170)
                    .padding(6)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .listRowSeparator(.hidden)

            Section("첨부") {
                HStack {
                    PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 5, matching: .images) {
                        Label("이미지", systemImage: "photo")
                    }

                    Spacer()

                    Button {
                        showFileImporter = true
                    } label: {
                        Label("파일", systemImage: "paperclip")
                    }
                }

                if attachments.isEmpty {
                    Text("첨부 없음")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(attachments) { item in
                        HStack {
                            Image(systemName: item.isImage ? "photo" : "doc")
                                .foregroundStyle(.secondary)
                            Text(item.filename)
                                .font(.subheadline)
                                .lineLimit(1)
                            Spacer()
                            Button(role: .destructive) {
                                attachments.removeAll { $0.id == item.id }
                            } label: {
                                Image(systemName: "trash")
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .listRowSeparator(.hidden)

            Section {
                if !message.isEmpty {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(message.contains("완료") ? .green : .red)
                }

                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        Spacer()
                        if isSubmitting {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("등록")
                                .font(.headline)
                        }
                        Spacer()
                    }
                    .padding(.vertical, 10)
                    .foregroundStyle(.white)
                    .background(Color.black, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting)
            }
            .listRowSeparator(.hidden)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color(.systemGroupedBackground))
        .navigationTitle("글쓰기")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("닫기") { dismiss() }
            }
        }
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [
                .data,
                .pdf,
                .plainText,
                .image,
                .zip,
                .spreadsheet,
                .presentation,
                .item
            ],
            allowsMultipleSelection: true
        ) { result in
            switch result {
            case .success(let urls):
                for url in urls {
                    guard let data = try? Data(contentsOf: url) else { continue }
                    let mime = mimeType(for: url.pathExtension)
                    let fileName = url.lastPathComponent
                    attachments.append(LocalAttachment(data: data, filename: fileName, mimeType: mime, isImage: mime.hasPrefix("image/")))
                }
            case .failure:
                message = "파일을 불러오지 못했습니다."
            }
        }
        .onChange(of: selectedPhotos) { items in
            Task {
                await handlePickedPhotos(items)
            }
        }
    }

    private func handlePickedPhotos(_ items: [PhotosPickerItem]) async {
        for item in items {
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else { continue }
                let filename = "image-\(Int(Date().timeIntervalSince1970)).jpg"
                attachments.append(LocalAttachment(data: data, filename: filename, mimeType: "image/jpeg", isImage: true))
            } catch {
                message = "이미지를 불러오지 못했습니다."
            }
        }
        selectedPhotos.removeAll()
    }

    private func submit() async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedTitle.isEmpty else {
            message = "제목을 입력해 주세요."
            return
        }

        if trimmedContent.isEmpty && attachments.isEmpty {
            message = "내용 또는 첨부를 입력해 주세요."
            return
        }

        isSubmitting = true
        message = ""

        do {
            var finalContent = trimmedContent

            for attachment in attachments {
                let url = try await api.upload(
                    baseURL: config.baseURL,
                    data: attachment.data,
                    filename: attachment.filename,
                    mimeType: attachment.mimeType,
                    usage: nil
                )

                if attachment.isImage {
                    finalContent += "\n![\(attachment.filename)](\(url))"
                } else {
                    finalContent += "\n📎 [\(attachment.filename)](\(url))"
                }
            }

            try await api.createPost(
                baseURL: config.baseURL,
                exam: exam,
                board: boardSlug,
                authorName: session.displayName.isEmpty ? "익명" : session.displayName,
                title: trimmedTitle,
                content: finalContent
            )

            message = "등록 완료"
            dismiss()
        } catch {
            message = error.localizedDescription
        }

        isSubmitting = false
    }

    private func mimeType(for ext: String) -> String {
        let lower = ext.lowercased()
        switch lower {
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "pdf": return "application/pdf"
        case "txt": return "text/plain"
        case "zip": return "application/zip"
        case "doc": return "application/msword"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "xls": return "application/vnd.ms-excel"
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "ppt": return "application/vnd.ms-powerpoint"
        case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        case "hwp": return "application/octet-stream"
        default: return "application/octet-stream"
        }
    }
}
