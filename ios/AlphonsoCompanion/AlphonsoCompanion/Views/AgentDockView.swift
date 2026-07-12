import SwiftUI
import UIKit

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
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(avatarGradient)
                    .frame(width: 76, height: 76)
                    .shadow(color: statusColor.opacity(0.2), radius: 10, y: 4)

                AgentPortrait(name: name)
                    .frame(width: 66, height: 66)
                    .clipShape(Circle())
                    .overlay {
                        Circle()
                            .stroke(Color.white.opacity(0.9), lineWidth: 2)
                    }

                Circle()
                    .fill(statusColor)
                    .frame(width: 14, height: 14)
                    .overlay {
                        Circle()
                            .stroke(Color.black.opacity(0.08), lineWidth: 1)
                    }
                    .offset(x: 24, y: 24)
            }

            VStack(spacing: 4) {
                Text(name)
                    .font(.headline)
                    .multilineTextAlignment(.center)

                Text(statusText)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, minHeight: 174)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(.regularMaterial)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Color.white.opacity(0.18), lineWidth: 1)
        }
    }

    private var statusText: String {
        if let status {
            return status.status.capitalized
        }
        return "Idle"
    }

    private var avatarGradient: LinearGradient {
        let colors: [Color]
        switch name.lowercased() {
        case "alphonso":
            colors = [Color.blue.opacity(0.95), Color.cyan.opacity(0.75)]
        case "jose":
            colors = [Color.indigo.opacity(0.95), Color.purple.opacity(0.7)]
        case "hector":
            colors = [Color.green.opacity(0.9), Color.teal.opacity(0.7)]
        case "miya":
            colors = [Color.pink.opacity(0.95), Color.orange.opacity(0.7)]
        case "maria":
            colors = [Color.red.opacity(0.9), Color.orange.opacity(0.65)]
        case "marcus":
            colors = [Color.brown.opacity(0.9), Color.orange.opacity(0.65)]
        case "echo":
            colors = [Color.gray.opacity(0.9), Color.blue.opacity(0.6)]
        case "sentinel":
            colors = [Color.black.opacity(0.9), Color.gray.opacity(0.55)]
        case "nova":
            colors = [Color.mint.opacity(0.95), Color.cyan.opacity(0.7)]
        default:
            colors = [statusColor.opacity(0.95), statusColor.opacity(0.6)]
        }
        return LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
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

struct AgentPortrait: View {
    let name: String

    var body: some View {
        if UIImage(named: assetName) != nil {
            Image(assetName)
                .resizable()
                .scaledToFill()
        } else {
            ZStack {
                LinearGradient(
                    colors: [Color.black.opacity(0.2), Color.black.opacity(0.05)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Text(initials)
                    .font(.headline.weight(.bold))
                    .foregroundColor(.white)
            }
        }
    }

    private var assetName: String {
        name.lowercased()
    }

    private var initials: String {
        String(name.prefix(1)).uppercased()
    }
}
