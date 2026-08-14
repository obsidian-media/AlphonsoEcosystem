import SwiftUI

struct AgentDockView: View {
    @EnvironmentObject var webSocketService: WebSocketService
    @Binding var selectedTab: Int

    @State private var selectedAgent: AgentIdentity?

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
                            Button {
                                selectedAgent = agent
                            } label: {
                                AgentCard(agent: agent, status: webSocketService.agentStatuses[agent.name])
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Agents")
            .sheet(item: $selectedAgent) { agent in
                AgentProfileDrawer(agent: agent, selectedTab: $selectedTab)
            }
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
                 ? "\(activeCount) agent\(activeCount == 1 ? "" : "s") active now. Live status updates arrive from your desktop."
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
        Group {
            if let imageUrlString = agent.imageUrl, let url = URL(string: imageUrlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure, .empty:
                        fallbackImage
                    @unknown default:
                        fallbackImage
                    }
                }
            } else {
                fallbackImage
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .accessibilityHidden(true)
    }

    private var fallbackImage: some View {
        Image(agent.assetName)
            .resizable()
            .scaledToFill()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: agent.portraitAlignment)
    }
}

private struct AgentIdentity: Identifiable {
    let name: String
    let role: String
    let summary: String
    let accent: Color
    let portraitAlignment: Alignment
    let imageUrl: String?

    var id: String { name }
    var assetName: String { name.lowercased() }

    static let all: [AgentIdentity] = [
        .init(
            name: "Alphonso",
            role: "Local operator",
            summary: "Runs work, checks results, and packages outcomes.",
            accent: .cyan,
            portraitAlignment: .trailing,
            imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3ESNJkrNMFHLSXQUcOGQ7tw7sj0/hf_20260810_043623_64a2afa4-ead6-41f9-a9d3-5ed995bae9ca.png"
        ),
        .init(
            name: "Jose",
            role: "Orchestrator",
            summary: "Routes work, coordinates agents, and keeps approvals visible.",
            accent: .orange,
            portraitAlignment: .center,
            imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3ESNJkrNMFHLSXQUcOGQ7tw7sj0/hf_20260809_095654_f1c94b35-2beb-49b5-8dcc-58c951aa4293.png"
        ),
        .init(
            name: "Hector",
            role: "Research",
            summary: "Finds, verifies, and synthesizes reliable sources.",
            accent: .blue,
            portraitAlignment: .center,
            imageUrl: nil
        ),
        .init(
            name: "Miya",
            role: "Creative director",
            summary: "Shapes campaign ideas, storyboards, and exports.",
            accent: .pink,
            portraitAlignment: .center,
            imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3ESNJkrNMFHLSXQUcOGQ7tw7sj0/hf_20260810_054358_edd3e738-9783-43c3-a2a0-0572c2fa4261.png"
        ),
        .init(
            name: "Maria",
            role: "Governance",
            summary: "Reviews risk, approvals, and audit evidence.",
            accent: .purple,
            portraitAlignment: .center,
            imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3ESNJkrNMFHLSXQUcOGQ7tw7sj0/hf_20260809_130028_e8598036-b02c-4f82-9a87-9147d77a850a.png"
        ),
        .init(
            name: "Marcus",
            role: "Distribution",
            summary: "Executes approved publishing and delivery work.",
            accent: .green,
            portraitAlignment: .center,
            imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3ESNJkrNMFHLSXQUcOGQ7tw7sj0/hf_20260809_080103_eb5eb60c-8dab-4a5e-81ae-aadc97ca821a.png"
        ),
        .init(
            name: "Echo",
            role: "Memory historian",
            summary: "Preserves context and makes past work retrievable.",
            accent: .indigo,
            portraitAlignment: .center,
            imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3ESNJkrNMFHLSXQUcOGQ7tw7sj0/hf_20260810_050226_44c0d167-1d3a-402d-8513-385e77e27d17.png"
        ),
        .init(
            name: "Sentinel",
            role: "Safety monitor",
            summary: "Watches automation safety and policy boundaries.",
            accent: .red,
            portraitAlignment: .center,
            imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3ESNJkrNMFHLSXQUcOGQ7tw7sj0/hf_20260810_044803_fe131f78-e621-4060-ad35-1df4ba8ae0bc.png"
        ),
        .init(
            name: "Nova",
            role: "Opportunity analyst",
            summary: "Scores options and highlights the strongest next move.",
            accent: .yellow,
            portraitAlignment: .center,
            imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3ESNJkrNMFHLSXQUcOGQ7tw7sj0/hf_20260810_050229_3690b86a-6e41-4840-8716-e238f3070d49.png"
        )
    ]
}

private struct AgentProfileDrawer: View {
    let agent: AgentIdentity
    @Binding var selectedTab: Int
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var webSocketService: WebSocketService

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                AgentPortrait(agent: agent)
                    .frame(height: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 5)
                    .padding(.top, 10)

                VStack(alignment: .leading, spacing: 8) {
                    Text(agent.role.uppercased())
                        .font(CompanionTheme.section)
                        .foregroundStyle(agent.accent)
                        .tracking(1.2)

                    Text(agent.name)
                        .font(.system(.largeTitle, design: .rounded).weight(.bold))
                        .foregroundStyle(CompanionTheme.ink)

                    Text(agent.summary)
                        .font(CompanionTheme.body)
                        .foregroundStyle(CompanionTheme.mutedInk)
                        .padding(.top, 4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)

                Spacer()

                Button {
                    webSocketService.preconfiguredAgentID = agent.name.lowercased()
                    selectedTab = 2 // Switch to Chat
                    dismiss()
                } label: {
                    HStack {
                        Spacer()
                        Label("Direct \(agent.name)", systemImage: "paperplane.fill")
                            .font(.headline)
                        Spacer()
                    }
                    .padding(.vertical, 16)
                    .background(agent.accent)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.bottom, 12)
            }
            .padding(24)
            .background(CompanionTheme.canvas)
            .navigationTitle("Agent Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }
}
