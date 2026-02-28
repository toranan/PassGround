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
    @State private var postAnonymous = true

    @State private var isSubmitting = false
    @State private var message = ""

    var body: some View {
        VStack(spacing: 0) {
            // MARK: - 제목 영역
            TextField("제목", text: $title)
                .font(.system(size: 20, weight: .bold))
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            
            Divider()
                .padding(.horizontal, 16)
            
            // MARK: - 본문 영역
            ZStack(alignment: .topLeading) {
                TextEditor(text: $content)
                    .font(.system(size: 16))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                    .scrollContentBackground(.hidden)
                    .background(Color(UIColor.systemBackground))
                
                if content.isEmpty {
                    Text("내용을 입력하세요.\n\n욕설, 타인 비방, 광고 등의 내용은 제재 대상입니다.")
                        .font(.system(size: 16))
                        .foregroundColor(Color(UIColor.placeholderText))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 20)
                        .allowsHitTesting(false)
                }
            }
            
            // MARK: - 상태 메시지 및 첨부파일 영역
            if !message.isEmpty {
                Text(message)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(message.contains("완료") ? .green : .red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
            }
            
            if !attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(attachments) { item in
                            HStack(spacing: 6) {
                                Image(systemName: item.isImage ? "photo.fill" : "doc.fill")
                                    .foregroundColor(Color(red: 0.05, green: 0.65, blue: 0.65))
                                Text(item.filename)
                                    .font(.system(size: 13))
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                                    .frame(maxWidth: 120)
                                Button {
                                    attachments.removeAll { $0.id == item.id }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(Color(UIColor.systemGray3))
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(Color(UIColor.systemGray6))
                            .cornerRadius(8)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }
            }
            
            // MARK: - 하단 첨부 툴바
            HStack(spacing: 20) {
                PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 5, matching: .images) {
                    Image(systemName: "camera")
                        .font(.system(size: 22))
                        .foregroundColor(.gray)
                }
                
                Button {
                    showFileImporter = true
                } label: {
                    Image(systemName: "paperclip")
                        .font(.system(size: 22))
                        .foregroundColor(.gray)
                }
                
                Spacer()
                
                Button {
                    postAnonymous.toggle()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: postAnonymous ? "checkmark.square.fill" : "square")
                        Text("익명")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .foregroundColor(postAnonymous ? .red : .gray)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(postAnonymous ? Color.red.opacity(0.1) : Color(UIColor.systemGray6))
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(UIColor.systemBackground))
            .overlay(
                Rectangle()
                    .frame(height: 1)
                    .foregroundColor(Color(UIColor.systemGray5)),
                alignment: .top
            )
        }
        .background(Color(UIColor.systemBackground))
        .navigationTitle("글쓰기")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark")
                        .foregroundColor(.primary)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: {
                    Task { await submit() }
                }) {
                    if isSubmitting {
                        ProgressView().tint(.red)
                    } else {
                        Text("등록")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.red)
                    }
                }
                .disabled(isSubmitting)
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
                authorName: postAnonymous ? "익명" : (session.displayName.isEmpty ? "익명" : session.displayName),
                title: trimmedTitle,
                content: finalContent,
                userId: session.user?.id,
                accessToken: session.accessToken.isEmpty ? nil : session.accessToken
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
