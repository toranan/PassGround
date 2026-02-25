import SwiftUI

struct BlindHeaderView: View {
    var body: some View {
        HStack {
            Button(action: {}) {
                Image(systemName: "line.3.horizontal")
                    .font(.title2)
                    .foregroundColor(.primary)
            }
            Text("blind")
                .font(.title2.bold())
                .padding(.leading, 8)
            Spacer()
            HStack(spacing: 16) {
                Button(action: {}) {
                    Image(systemName: "magnifyingglass")
                        .font(.title3)
                        .foregroundColor(.primary)
                }
                Button(action: {}) {
                    Image(systemName: "ellipsis.bubble")
                        .font(.title3)
                        .foregroundColor(.primary)
                }
                Button(action: {}) {
                    Image(systemName: "person")
                        .font(.title3)
                        .foregroundColor(.primary)
                }
            }
        }
        .padding(.horizontal)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }
}

#Preview {
    BlindHeaderView()
}
