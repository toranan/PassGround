import SwiftUI

/// 스크린샷과 동일한 UI를 구성한 에브리타임 스타일 댓글 화면입니다.
struct CommentUIPreview: View {
    @State private var commentText: String = ""
    @State private var isAnonymous: Bool = true
    
    var body: some View {
        VStack(spacing: 0) {
            // MARK: - 상단 네비게이션 바
            HStack {
                Image(systemName: "chevron.left")
                    .font(.title2)
                    .fontWeight(.medium)
                Spacer()
                VStack(spacing: 2) {
                    Text("자유게시판")
                        .font(.system(size: 15, weight: .bold))
                    Text("동국대 서울캠")
                        .font(.system(size: 12))
                        .foregroundColor(.gray)
                }
                Spacer()
                HStack(spacing: 16) {
                    Image(systemName: "bell")
                        .foregroundColor(.gray)
                    Image(systemName: "ellipsis")
                        .rotationEffect(.degrees(90))
                        .foregroundColor(.gray)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 12)
            
            // MARK: - 본문 및 댓글 스크롤 영역
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    
                    // 1. 게시글 작성자 정보
                    HStack(spacing: 12) {
                        Image(systemName: "person.fill")
                            .resizable()
                            .scaledToFit()
                            .padding(8)
                            .frame(width: 40, height: 40)
                            .background(Color(UIColor.systemGray4))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .foregroundColor(.white)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("익명")
                                .font(.system(size: 15, weight: .bold))
                            Text("02/28 03:01")
                                .font(.system(size: 13))
                                .foregroundColor(.gray)
                        }
                        Spacer()
                    }
                    .padding(.horizontal)
                    .padding(.top, 16)
                    
                    // 2. 게시글 내용
                    VStack(alignment: .leading, spacing: 16) {
                        Text("영어 잘하는 사람 중에 Ai\n답변 평가 부업해볼사람")
                            .font(.system(size: 20, weight: .bold))
                            .lineSpacing(4)
                        
                        Text("쪽지 ㄱㄱ\n\n사기아님\n\n된다고 보장x\n\n영어는 수능 2등급 수준이면 가능")
                            .font(.system(size: 15))
                            .lineSpacing(4)
                    }
                    .padding(.horizontal)
                    .padding(.top, 16)
                    .padding(.bottom, 24)
                    
                    // 3. 좋아요, 댓글수, 스크랩 바
                    HStack {
                        Spacer()
                        ActionButton(icon: "hand.thumbsup.fill", title: "공감", color: Color(UIColor.systemGray3))
                        Spacer()
                        ActionButton(icon: "bubble.left.fill", title: "댓글 2", color: Color(UIColor.systemGray3))
                        Spacer()
                        ActionButton(icon: "bookmark.fill", title: "스크랩", color: Color(UIColor.systemGray3))
                        Spacer()
                    }
                    .padding(.vertical, 16)
                    .overlay(
                        Rectangle()
                            .frame(height: 1)
                            .foregroundColor(Color(UIColor.systemGray6)),
                        alignment: .top
                    )
                    
                    // 4. 광고 배너 영역
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("광고")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.gray)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 2)
                                    .background(Color.white)
                                    .cornerRadius(2)
                                Text("다운로드")
                                    .font(.system(size: 11))
                                    .foregroundColor(.gray)
                            }
                            Text("메이플 키우기")
                                .font(.system(size: 15, weight: .bold))
                            Text("100일 동안 함께해 주신 모든 용사님들께 드리는 쿠폰")
                                .font(.system(size: 12))
                                .foregroundColor(.gray)
                                .lineLimit(1)
                        }
                        Spacer()
                        RoundedRectangle(cornerRadius: 12)
                            .fill(LinearGradient(colors: [.orange, .yellow, .green], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .frame(width: 60, height: 60)
                            .overlay(
                                Text("🍄")
                                    .font(.system(size: 30))
                            )
                    }
                    .padding(16)
                    .background(Color(UIColor.systemGray6))
                    
                    // 5. 댓글 리스트 영역
                    VStack(spacing: 0) {
                        // 첫 번째 댓글
                        CommentCell(
                            name: "익명1",
                            content: "문장이랑 조사가 너무 안맞는데",
                            time: "02/28 03:12",
                            isReply: false,
                            isAuthor: false
                        )
                        
                        // 첫 번째 댓글의 대댓글(글쓴이)
                        CommentCell(
                            name: "익명(글쓴이)",
                            content: "새벽이라그럼; 시진핑/신천지/기타캄보디아사기충 개새기",
                            time: "02/28 03:12",
                            isReply: true,
                            isAuthor: true
                        )
                    }
                }
            }
            .scrollDismissesKeyboard(.immediately)
            
            // MARK: - 하단 댓글 입력창 (키보드 위 고정)
            HStack(spacing: 12) {
                // 익명 체크박스
                Button(action: {
                    isAnonymous.toggle()
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: isAnonymous ? "checkmark.square.fill" : "square")
                            .foregroundColor(isAnonymous ? .red : .gray)
                            .font(.system(size: 18))
                        Text("익명")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(isAnonymous ? .red : .gray)
                    }
                }
                
                // 입력 필드
                TextField("댓글을 입력하세요.", text: $commentText)
                    .font(.system(size: 15))
                    .padding(.vertical, 8)
                
                // 전송 버튼
                Button(action: {
                    // 전송 액션
                }) {
                    Image(systemName: "paperplane")
                        .font(.system(size: 20))
                        .foregroundColor(.red)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(UIColor.systemGray6)) // 연한 회색 배경
            .cornerRadius(20) // 모서리 둥글게
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
            .padding(.top, 8)
        }
    }
}

// Subview: 중간 라인 버튼(공감, 댓글수 등)
struct ActionButton: View {
    let icon: String
    let title: String
    let color: Color
    
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .bold))
            Text(title)
                .font(.system(size: 14, weight: .bold))
        }
        .foregroundColor(color)
    }
}

// Subview: 댓글 및 대댓글 셀 공통 컴포넌트
struct CommentCell: View {
    let name: String
    let content: String
    let time: String
    let isReply: Bool
    let isAuthor: Bool
    
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if isReply {
                // 대댓글 꺾쇠 화살표 아이콘 모양 통일
                Image(systemName: "arrow.turn.down.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(UIColor.systemGray3))
                    .padding(.top, 16)
                    .padding(.leading, 16)
            }
            
            // 실제 내용 영역 (대댓글일 경우 옅은 회색 배경 박스 안으로 들어감)
            HStack(alignment: .top, spacing: 10) {
                // 프로필 아이콘 (둥근 사각형)
                Image(systemName: "person.fill")
                    .resizable()
                    .scaledToFit()
                    .padding(5)
                    .frame(width: 28, height: 28)
                    .background(Color(UIColor.systemGray4))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .foregroundColor(.white)
                
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .center) {
                        // 닉네임 (글쓴이는 청록색)
                        Text(name)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(isAuthor ? Color(red: 0.05, green: 0.65, blue: 0.65) : .primary)
                        
                        Spacer()
                        
                        // 우측 상단 액션 버튼 그룹 (말풍선, 따봉, 점3개) - 둥근 알약(Pill) 모양
                        HStack(spacing: 8) {
                            if !isReply {
                                Image(systemName: "bubble.left.fill")
                                Text("|").font(.system(size: 9)).foregroundColor(Color(UIColor.systemGray4))
                            }
                            Image(systemName: "hand.thumbsup.fill")
                            Text("|").font(.system(size: 9)).foregroundColor(Color(UIColor.systemGray4))
                            Image(systemName: "ellipsis")
                        }
                        .foregroundColor(Color(UIColor.systemGray3))
                        .font(.system(size: 11))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(isReply ? Color.white : Color(UIColor.systemGray6))
                        .cornerRadius(6)
                    }
                    
                    // 본문 (시간과 간격 조절)
                    Text(content)
                        .font(.system(size: 15))
                        .foregroundColor(.primary)
                        .lineSpacing(3)
                        .padding(.top, 2)
                        .padding(.bottom, 2)
                    
                    // 작성 시간
                    Text(time)
                        .font(.system(size: 12))
                        .foregroundColor(Color.gray)
                }
            }
            .padding(.all, isReply ? 12 : 16)
            // 대댓글은 회색 배경 박스, 일반 댓글은 흰 배경
            .background(isReply ? Color(UIColor.systemGray6).opacity(0.8) : Color.white)
            .cornerRadius(isReply ? 10 : 0)
            .padding(.trailing, 16)
            .padding(.vertical, isReply ? 6 : 0)
        }
        .padding(.leading, isReply ? -4 : 0) // 대댓글 화살표 위치 미세조정
        // 하단 선 (대댓글이 아닐 때만 하단에 옅은 가로선을 그어 확실히 구분)
        .overlay(
            !isReply ?
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color(UIColor.systemGray6)) : nil,
            alignment: .bottom
        )
    }
}

// MARK: - Preview용
#Preview {
    CommentUIPreview()
}
