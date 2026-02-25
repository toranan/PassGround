import SwiftUI

struct TimerView: View {
    @State private var selectedMode = 0

    var body: some View {
        VStack(spacing: 12) {
            Picker("모드", selection: $selectedMode) {
                Text("스톱워치").tag(0)
                Text("카운트다운").tag(1)
            }
            .pickerStyle(.segmented)

            if selectedMode == 0 {
                StopwatchCard()
            } else {
                CountdownCard()
            }

            Spacer()
        }
        .padding()
        .navigationTitle("타이머")
    }
}

private struct StopwatchCard: View {
    @State private var running = false
    @State private var elapsed: TimeInterval = 0
    @State private var timer: Timer?

    var body: some View {
        VStack(spacing: 24) {
            Text(format(elapsed))
                .font(.system(size: 52, weight: .bold, design: .monospaced))

            HStack(spacing: 16) {
                Button(running ? "일시정지" : "시작") {
                    running.toggle()
                    running ? start() : stop()
                }
                .buttonStyle(.borderedProminent)

                Button("초기화") {
                    stop()
                    running = false
                    elapsed = 0
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .onDisappear {
            stop()
        }
    }

    private func start() {
        stop()
        timer = Timer.scheduledTimer(withTimeInterval: 0.01, repeats: true) { _ in
            elapsed += 0.01
        }
    }

    private func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func format(_ interval: TimeInterval) -> String {
        let centi = Int((interval * 100).truncatingRemainder(dividingBy: 100))
        let sec = Int(interval) % 60
        let min = Int(interval) / 60
        return String(format: "%02d:%02d:%02d", min, sec, centi)
    }
}

private struct CountdownCard: View {
    @State private var duration: TimeInterval = 3600
    @State private var remaining: TimeInterval = 3600
    @State private var running = false
    @State private var timer: Timer?

    var body: some View {
        VStack(spacing: 24) {
            Text(format(remaining))
                .font(.system(size: 52, weight: .bold, design: .monospaced))

            HStack {
                quickSetButton("30분", minutes: 30)
                quickSetButton("60분", minutes: 60)
                quickSetButton("90분", minutes: 90)
            }

            HStack(spacing: 16) {
                Button(running ? "일시정지" : "시작") {
                    running.toggle()
                    running ? start() : stop()
                }
                .buttonStyle(.borderedProminent)
                .disabled(remaining <= 0)

                Button("초기화") {
                    stop()
                    running = false
                    remaining = duration
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .onDisappear {
            stop()
        }
    }

    private func quickSetButton(_ title: String, minutes: Int) -> some View {
        Button(title) {
            stop()
            running = false
            duration = TimeInterval(minutes * 60)
            remaining = duration
        }
        .buttonStyle(.bordered)
    }

    private func start() {
        stop()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            if remaining <= 1 {
                remaining = 0
                running = false
                stop()
            } else {
                remaining -= 1
            }
        }
    }

    private func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func format(_ interval: TimeInterval) -> String {
        let total = Int(interval)
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        return String(format: "%02d:%02d:%02d", h, m, s)
    }
}
