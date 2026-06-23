import SwiftUI

struct BoardroomView: View {
    @EnvironmentObject var webSocketService: WebSocketService

    @State private var projects: [Project] = []
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            List {
                if isLoading {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                    .padding()
                } else if projects.isEmpty {
                    Text("No projects yet")
                        .foregroundStyle(.secondary)
                        .padding()
                } else {
                    ForEach(projects) { project in
                        ProjectRow(project: project)
                    }
                }
            }
            .navigationTitle("Boardroom")
            .refreshable {
                await loadProjects()
            }
            .task {
                await loadProjects()
            }
        }
    }

    private func loadProjects() async {
        // TODO: Wire to WebSocket get_projects method
        projects = []
    }
}

struct ProjectRow: View {
    let project: Project

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(project.name)
                .font(.headline)
            Text(project.description)
                .font(.caption)
                .foregroundStyle(.secondary)
            ProgressView(value: project.progress)
        }
        .padding(.vertical, 4)
    }
}

struct Project: Identifiable {
    let id = UUID()
    let name: String
    let description: String
    let progress: Double
}