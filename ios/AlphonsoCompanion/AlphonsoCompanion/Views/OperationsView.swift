import SwiftUI

struct OperationsView: View {
    @EnvironmentObject var webSocketService: WebSocketService

    var body: some View {
        CompanionPage {
            header
            CompanionRule()
            needsYou
            inMotion
            recentOutcomes
        }
        .refreshable { webSocketService.refreshOperations() }
        .task(id: webSocketService.connectionState) {
            webSocketService.refreshOperations()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Operations")
                    .font(CompanionTheme.display)
                    .foregroundStyle(CompanionTheme.ink)
                Spacer()
                connectionLabel
            }
            Text(headerDetail)
                .font(CompanionTheme.body)
                .foregroundStyle(CompanionTheme.mutedInk)
            if webSocketService.connectionState == .authenticated {
                CompanionActionButton("Refresh operations") {
                    webSocketService.refreshOperations()
                }
                .accessibilityHint("Fetches the latest state from the paired desktop")
            }
        }
    }

    private var connectionLabel: some View {
        CompanionStatusMark(status: webSocketService.connectionState == .authenticated ? "connected" : "offline")
    }

    private var headerDetail: String {
        guard webSocketService.connectionState == .authenticated else {
            return "Pair with your desktop to review live work and outcomes."
        }
        if let refreshedAt = webSocketService.lastOperationsRefreshAt {
            return "Paired desktop · refreshed \(refreshedAt.formatted(.relative(presentation: .named)))"
        }
        return "Paired desktop · waiting for the first operations refresh."
    }

    private var needsYou: some View {
        VStack(alignment: .leading, spacing: 0) {
            CompanionSectionHeader("Needs you", detail: "Approvals are only shown when the paired desktop owns a live queue.")
            EmptyOperationsRow(
                icon: webSocketService.connectionState == .authenticated ? "checkmark" : "link",
                title: webSocketService.connectionState == .authenticated ? "Nothing needs your approval" : "Desktop not paired",
                detail: webSocketService.connectionState == .authenticated
                    ? "No actionable approval records are available from the desktop yet."
                    : "Connect from the Connect tab, then return here."
            )
            CompanionRule()
        }
    }

    private var inMotion: some View {
        VStack(alignment: .leading, spacing: 0) {
            CompanionSectionHeader("In motion", detail: "Current orchestration receipts from the paired desktop.")
            if webSocketService.operationsSnapshot.activeWork.isEmpty {
                EmptyOperationsRow(icon: "bolt.slash", title: "No work is in motion", detail: "New activity appears here as the desktop records it.")
            } else {
                ForEach(webSocketService.operationsSnapshot.activeWork) { item in
                    OperationsWorkRow(item: item, canStop: item.commandID.map { webSocketService.activeCommandIDs.contains($0) } ?? false) {
                        if let commandID = item.commandID { webSocketService.abortCommand(commandId: commandID) }
                    }
                    CompanionRule()
                }
            }
        }
    }

    private var recentOutcomes: some View {
        VStack(alignment: .leading, spacing: 0) {
            CompanionSectionHeader("Recent outcomes", detail: "The latest recorded results—not projected work.")
            if webSocketService.operationsSnapshot.recentOutcomes.isEmpty {
                EmptyOperationsRow(icon: "clock", title: "No outcomes recorded", detail: "Completed or stopped desktop work will appear here.")
            } else {
                ForEach(webSocketService.operationsSnapshot.recentOutcomes) { outcome in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(outcome.summary)
                                .font(CompanionTheme.title)
                                .foregroundStyle(CompanionTheme.ink)
                            Spacer(minLength: 12)
                            CompanionStatusMark(status: outcome.status)
                        }
                        Text(outcome.agent.capitalized + " · " + outcome.completedAt.formatted(.relative(presentation: .named)))
                            .font(CompanionTheme.caption)
                            .foregroundStyle(CompanionTheme.mutedInk)
                    }
                    .padding(.vertical, 16)
                    CompanionRule()
                }
            }
        }
    }
}

private struct EmptyOperationsRow: View {
    let icon: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(CompanionTheme.quietInk)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(CompanionTheme.title).foregroundStyle(CompanionTheme.ink)
                Text(detail).font(CompanionTheme.body).foregroundStyle(CompanionTheme.mutedInk)
            }
        }
        .padding(.vertical, 18)
    }
}

private struct OperationsWorkRow: View {
    let item: OperationsWorkItem
    let canStop: Bool
    let stop: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline) {
                Text(item.title).font(CompanionTheme.title).foregroundStyle(CompanionTheme.ink)
                Spacer(minLength: 12)
                CompanionStatusMark(status: item.status)
            }
            HStack {
                Text(item.agent.capitalized + " · " + item.updatedAt.formatted(.relative(presentation: .named)))
                    .font(CompanionTheme.caption)
                    .foregroundStyle(CompanionTheme.mutedInk)
                Spacer()
                if canStop {
                    CompanionActionButton("Stop", role: .destructive, action: stop)
                        .accessibilityHint("Requests that the paired desktop stop this command")
                }
            }
        }
        .padding(.vertical, 16)
    }
}
