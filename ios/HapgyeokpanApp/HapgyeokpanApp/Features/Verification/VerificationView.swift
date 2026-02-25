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
