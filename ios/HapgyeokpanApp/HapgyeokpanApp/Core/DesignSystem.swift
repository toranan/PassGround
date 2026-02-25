import SwiftUI

/// 글로벌 디자인 시스템 (토스/블라인드 통합 모던 스타일)
enum DesignSystem {
    /// 메인 포인트 컬러 (Indigo/Blue 계열)
    static let primary = Color(red: 79/255, green: 70/255, blue: 229/255)
    
    /// 배경 컬러 (토스 스타일의 아주 옅은 회색 배경)
    static let background = Color(UIColor.systemGroupedBackground)
    
    /// 카드 컴포넌트용 배경 (흰색)
    static let cardBackground = Color.white
    
    /// 카드 코너 라운드 기본값
    static let cardCornerRadius: CGFloat = 16
    
    /// 내부 패딩 (카드 안)
    static let padding: CGFloat = 16
    
    /// 리스트 뷰 아이템 간격
    static let spacing: CGFloat = 12
}
