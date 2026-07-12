import SwiftUI

struct BoardroomView: View {
    @EnvironmentObject var webSocketService: WebSocketService

    var body: some View {
        NavigationStack {
            List {
                if webSocketService.boardroomSessions.isEmpty {
                    Section {
                        VStack(spacing: 12) {
                            Image(systemName: webSocketService.connectionState == .authenticated ? "tray" : "wifi.slash")
                                .font(.largeTitle)
                                .foregroundStyle(.secondary)
                            Text(webSocketService.connectionState == .authenticated ? "No boardroom sessions yet" : "Connect to the desktop to load boardroom sessions")
                                .font(.headline)
                                .foregroundStyle(.secondary)
                            Text(webSocketService.connectionState == .authenticated ? "Sessions will appear here when tasks are executed on the desktop." : "Boardroom data is only available once the companion is paired and authenticated.")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                                .multilineTextAlignment(.center)
                            if let lastBoardroomRefreshAt = webSocketService.lastBoardroomRefreshAt {
                                Text("Last refresh \(lastBoardroomRefreshAt, style: .relative) ago")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                    }
                } else {
                    let sessions = Array(webSocketService.boardroomSessions)
                    ForEach(sessions) { session in
                        Section(session.title) {
                            if session.goals.isEmpty {
                                Text("No goals in this session")
                                    .foregroundStyle(.secondary)
                                    .font(.caption)
                            } else {
                                ForEach(session.goals) { goal in
                                    GoalRow(goal: goal)
                                }
                            }
                            
                            HStack {
                                Label(session.status, systemImage: statusIcon(session.status))
                                    .font(.caption)
                                    .foregroundStyle(statusColor(session.status))
                                Spacer()
                                Text(session.createdAt, style: .relative)
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }
                }

                if let lastBoardroomRefreshAt = webSocketService.lastBoardroomRefreshAt {
                    Section("Sync") {
                        HStack {
                            Text("Last refresh")
                            Spacer()
                            Text(lastBoardroomRefreshAt, style: .relative)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Boardroom")
            .refreshable {
                loadBoardroom()
            }
            .task {
                loadBoardroom()
            }
        }
    }

    private func loadBoardroom() {
        let msg = #"{"id":"boardroom","method":"get_boardroom","params":{}}"#
        webSocketService.sendRaw(text: msg)
    }
    
    private func statusIcon(_ status: String) -> String {
        switch status.lowercased() {
        case "active": return "play.circle.fill"
        case "completed": return "checkmark.circle.fill"
        case "failed": return "xmark.circle.fill"
        default: return "circle"
        }
    }
    
    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "active": return .blue
        case "completed": return .green
        case "failed": return .red
        default: return .secondary
        }
    }
}

struct GoalRow: View {
    let goal: Goal

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(goal.title)
                    .font(.headline)
                Spacer()
                Text(goal.status)
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(statusColor(goal.status).opacity(0.2))
                    .foregroundColor(statusColor(goal.status))
                    .cornerRadius(4)
            }
            if !goal.description.isEmpty {
                Text(goal.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
    
    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "active": return .blue
        case "completed": return .green
        case "failed": return .red
        default: return .secondary
        }
    }
}

struct BatchRow: View {
    let batch: Batch

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(batch.title)
                .font(.subheadline)
            Text("Tasks: \(batch.tasks.count)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

struct TaskRow: View {
    let task: TaskItem

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(task.title)
                    .font(.subheadline)
                Text("Owner: \(task.owner)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(task.status)
                .font(.caption)
                .padding(4)
                .background(Color.secondary.opacity(0.2))
                .cornerRadius(4)
        }
        .padding(.vertical, 4)
    }
}
