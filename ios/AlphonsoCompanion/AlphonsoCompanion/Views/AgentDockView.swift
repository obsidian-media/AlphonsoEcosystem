import SwiftUI

struct AgentDockView: View {
    @EnvironmentObject var webSocketService: WebSocketService

    private let agents = AgentIdentity.all

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    AgentDockHeader(
                        activeCount: webSocketService.agentStatuses.values.filter { $0.status == "running" || $0.status == "active" }.count,
                        isConnected: webSocketService.connectionState == .authenticated
                    )

                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 164), spacing: 14)],
                        spacing: 14
                    ) {
                        ForEach(agents) { agent in
                            AgentCard(agent: agent, status: webSocketService.agentStatuses[agent.name])
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Agents")
        }
    }
}

private struct AgentDockHeader: View {
    let activeCount: Int
    let isConnected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(isConnected ? "Companion connected" : "Desktop connection required", systemImage: isConnected ? "checkmark.circle.fill" : "link.badge.plus")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(isConnected ? Color.green : Color.secondary)

            Text(isConnected ? "Your operating crew" : "Meet your operating crew")
                .font(.system(.title2, design: .rounded).weight(.bold))

            Text(isConnected
                 ? "(activeCount) agent\(activeCount == 1 ? "" : "s") active now. Live status updates arrive from your desktop."
                 : "Pair with your desktop to see live activity and delegate work with confidence.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(
            LinearGradient(
                colors: [Color.indigo.opacity(0.92), Color.blue.opacity(0.72)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .foregroundStyle(.white)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

private struct AgentCard: View {
    let agent: AgentIdentity
    let status: AgentStatus?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AgentPortrait(agent: agent)
                .frame(maxWidth: .infinity)
                .frame(height: 150)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(alignment: .bottomLeading) {
                    Text(agent.name)
                        .font(.system(.headline, design: .rounded).weight(.bold))
                        .foregroundStyle(.white)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            LinearGradient(
                                colors: [.clear, .black.opacity(0.72)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                }

            Text(agent.role)
                .font(.caption.weight(.semibold))
                .foregroundStyle(agent.accent)

            Text(agent.summary)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 6) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 8, height: 8)
                Text(statusText)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(agent.name), \(agent.role), \(statusText)")
    }

    private var statusText: String { status?.status.capitalized ?? "Standing by" }

    private var statusColor: Color {
        switch status?.status.lowercased() {
        case "running", "active": return .green
        case "idle", "waiting": return .orange
        case "error", "failed": return .red
        default: return .secondary
        }
    }
}

private struct AgentPortrait: View {
    let agent: AgentIdentity

    var body: some View {
        Image(agent.assetName)
            .resizable()
            .scaledToFill()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: agent.portraitAlignment)
            .clipped()
            .accessibilityHidden(true)
    }
}

private struct AgentIdentity: Identifiable {
    let name: String
    let role: String
    let summary: String
    let accent: Color
    let portraitAlignment: Alignment

    var id: String { name }
    var assetName: String { name.lowercased() }

    static let all: [AgentIdentity] = [
        .init(name: "Alphonso", role: "Local operator", summary: "Runs work, checks results, and packages outcomes.", accent: .cyan, portraitAlignment: .trailing),
        .init(name: "Jose", role: "Orchestrator", summary: "Routes work, coordinates agents, and keeps approvals visible.", accent: .orange, portraitAlignment: .center),
        .init(name: "Hector", role: "Research", summary: "Finds, verifies, and synthesizes reliable sources.", accent: .blue, portraitAlignment: .center),
        .init(name: "Miya", role: "Creative director", summary: "Shapes campaign ideas, storyboards, and exports.", accent: .pink, portraitAlignment: .center),
        .init(name: "Maria", role: "Governance", summary: "Reviews risk, approvals, and audit evidence.", accent: .purple, portraitAlignment: .center),
        .init(name: "Marcus", role: "Distribution", summary: "Executes approved publishing and delivery work.", accent: .green, portraitAlignment: .center),
        .init(name: "Echo", role: "Memory historian", summary: "Preserves context and makes past work retrievable.", accent: .indigo, portraitAlignment: .center),
        .init(name: "Sentinel", role: "Safety monitor", summary: "Watches automation safety and policy boundaries.", accent: .red, portraitAlignment: .center),
        .init(name: "Nova", role: "Opportunity analyst", summary: "Scores options and highlights the strongest next move.", accent: .yellow, portraitAlignment: .center),
    ]
}
