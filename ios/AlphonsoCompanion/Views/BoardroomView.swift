import SwiftUI

struct BoardroomView: View {
    @EnvironmentObject var webSocketService: WebSocketService

    @State private var goals: [Goal] = []
    @State private var batches: [Batch] = []
    @State private var tasks: [TaskItem] = []
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            List {
                Section("Goals") {
                    if goals.isEmpty {
                        Text("No goals yet")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(goals) { goal in
                            GoalRow(goal: goal)
                        }
                    }
                }

                Section("Batches") {
                    if batches.isEmpty {
                        Text("No batches")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(batches) { batch in
                            BatchRow(batch: batch)
                        }
                    }
                }

                Section("Tasks") {
                    if tasks.isEmpty {
                        Text("No tasks")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(tasks) { task in
                            TaskRow(task: task)
                        }
                    }
                }
            }
            .navigationTitle("Boardroom")
            .refreshable {
                await loadBoardroom()
            }
            .task {
                await loadBoardroom()
            }
        }
    }

    private func loadBoardroom() async {
        let msg = #"{"id":"boardroom","method":"get_boardroom","params":{}}"#
        webSocketService.sendRaw(text: msg)
    }
}

struct GoalRow: View {
    let goal: Goal

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(goal.title)
                .font(.headline)
            Text(goal.description)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
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