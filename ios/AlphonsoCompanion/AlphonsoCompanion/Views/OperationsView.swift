import SwiftUI

struct OperationsView: View {
    @EnvironmentObject var webSocketService: WebSocketService

    var body: some View {
        CompanionPage {
            header
            CompanionRule()
            needsYou
            workflowLauncher
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
            if webSocketService.connectionState != .authenticated {
                EmptyOperationsRow(
                    icon: "link",
                    title: "Desktop not paired",
                    detail: "Connect from the Connect tab, then return here."
                )
                CompanionRule()
            } else if webSocketService.operationsSnapshot.approvals.isEmpty {
                EmptyOperationsRow(
                    icon: "checkmark",
                    title: "Nothing needs your approval",
                    detail: "No actionable approval records are available from the desktop yet."
                )
                CompanionRule()
            } else {
                ForEach(webSocketService.operationsSnapshot.approvals) { approval in
                    ApprovalRow(approval: approval) {
                        webSocketService.approveTask(id: approval.id)
                    }
                    CompanionRule()
                }
            }
        }
    }

    private var workflowLauncher: some View {
        VStack(alignment: .leading, spacing: 0) {
            CompanionSectionHeader("Workflow Launcher", detail: "Initiate guided agentic operations on your desktop with one tap.")
            
            if webSocketService.connectionState != .authenticated {
                EmptyOperationsRow(
                    icon: "play.circle",
                    title: "Launcher Offline",
                    detail: "Connect to the desktop to launch automated workflows."
                )
                CompanionRule()
            } else {
                VStack(spacing: 12) {
                    HStack(spacing: 12) {
                        workflowCard(
                            id: "WF_AI_SELF_DEV",
                            title: "Trigger Code Audit",
                            desc: "Audit local repository for debt & features",
                            icon: "shield.checkerboard"
                        )
                        workflowCard(
                            id: "WF_CONTENT_EMPIRE",
                            title: "Draft Release Blog",
                            desc: "Plan & draft structured release blog",
                            icon: "doc.plaintext"
                        )
                    }
                    HStack(spacing: 12) {
                        workflowCard(
                            id: "WF_GOVERN_AUTOMATION",
                            title: "Perform Security Scan",
                            desc: "Audit CSP, packages & search secrets",
                            icon: "lock.shield"
                        )
                        workflowCard(
                            id: "WF_PRODUCT_DEV",
                            title: "Product Dev Chain",
                            desc: "Pipeline: research, dev, test & launch",
                            icon: "cpu"
                        )
                    }
                }
                .padding(.vertical, 16)
                CompanionRule()
            }
        }
    }

    private func workflowCard(id: String, title: String, desc: String, icon: String) -> some View {
        Button {
            webSocketService.runWorkflow(id: id)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: icon)
                        .font(.system(size: 20))
                        .foregroundStyle(CompanionTheme.accent)
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.caption)
                        .foregroundStyle(CompanionTheme.quietInk)
                }
                Text(title)
                    .font(CompanionTheme.caption)
                    .foregroundStyle(CompanionTheme.ink)
                    .lineLimit(1)
                Text(desc)
                    .font(.system(size: 11))
                    .foregroundStyle(CompanionTheme.mutedInk)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(CompanionTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(CompanionTheme.rule, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
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

private struct ApprovalRow: View {
    let approval: ApprovalItem
    let approve: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(approval.summary.isEmpty ? approval.actionType.capitalized : approval.summary)
                        .font(CompanionTheme.title)
                        .foregroundStyle(CompanionTheme.ink)
                    Text(approval.reason)
                        .font(CompanionTheme.caption)
                        .foregroundStyle(CompanionTheme.mutedInk)
                }
                Spacer(minLength: 12)
                CompanionStatusMark(status: approval.riskLevel)
            }
            HStack {
                Spacer()
                CompanionActionButton("Approve", action: approve)
                    .accessibilityHint("Approves this pending action and resumes execution on the desktop")
            }
        }
        .padding(.vertical, 16)
    }
}
