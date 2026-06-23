import SwiftUI

struct AgentDockView: View {
    @EnvironmentObject var webSocketService: WebSocketService

    private let agents = [
        "Alphonso", "Jose", "Hector", "Miya", "Maria",
        "Marcus", "Echo", "Sentinel", "Nova"
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                    ForEach(agents, id: \.self) { agent in
                        AgentCard(name: agent, status: webSocketService.agentStatuses[agent])
                    }
                }
                .padding()
            }
            .navigationTitle("Agents")
        }
    }
}

struct AgentCard: View {
    let name: String
    let status: AgentStatus?

    var body: some View {
        VStack(spacing: 8) {
            Circle()
                .fill(statusColor)
                .frame(width: 60, height: 60)
                .overlay {
                    Image(systemName: "person.fill")
                        .font(.title2)
                        .foregroundColor(.white)
                }

            Text(name)
                .font(.headline)
                .multilineTextAlignment(.center)

            if let status = status {
                Text(status.status)
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                Circle()
                    .fill(Color.secondary)
                    .frame(width: 8, height: 8)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.regularMaterial)
        .cornerRadius(12)
    }

    private var statusColor: Color {
        guard let status = status else { return .secondary }
        switch status.status {
        case "running", "active": return .green
        case "idle": return .yellow
        case "error": return .red
        default: return .secondary
        }
    }
}