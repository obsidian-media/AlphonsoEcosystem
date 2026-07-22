import SwiftUI

enum CompanionTheme {
    static let canvas = Color(uiColor: .systemBackground)
    static let ink = Color(uiColor: .label)
    static let mutedInk = Color(uiColor: .secondaryLabel)
    static let quietInk = Color(uiColor: .tertiaryLabel)
    static let rule = Color(uiColor: .separator)
    static let accent = Color(red: 0.16, green: 0.18, blue: 0.46)
    static let success = Color(red: 0.08, green: 0.43, blue: 0.27)
    static let warning = Color(red: 0.62, green: 0.31, blue: 0.06)
    static let danger = Color(red: 0.67, green: 0.13, blue: 0.16)

    static let display = Font.system(size: 36, weight: .semibold, design: .serif)
    static let title = Font.system(size: 21, weight: .semibold, design: .rounded)
    static let section = Font.system(size: 12, weight: .bold, design: .rounded)
    static let body = Font.system(size: 16, weight: .regular, design: .rounded)
    static let caption = Font.system(size: 13, weight: .medium, design: .rounded)
}

struct CompanionPage<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ScrollView {
            content
                .frame(maxWidth: 700, alignment: .leading)
                .padding(.horizontal, 22)
                .padding(.vertical, 28)
        }
        .background(CompanionTheme.canvas)
    }
}

struct CompanionSectionHeader: View {
    let title: String
    let detail: String?

    init(_ title: String, detail: String? = nil) {
        self.title = title
        self.detail = detail
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(CompanionTheme.section)
                .tracking(1.4)
                .foregroundStyle(CompanionTheme.mutedInk)
            if let detail {
                Text(detail)
                    .font(CompanionTheme.caption)
                    .foregroundStyle(CompanionTheme.quietInk)
            }
        }
        .padding(.top, 26)
        .padding(.bottom, 8)
    }
}

struct CompanionRule: View {
    var body: some View {
        Rectangle()
            .fill(CompanionTheme.rule)
            .frame(height: 1)
    }
}

struct CompanionStatusMark: View {
    let status: String

    private var color: Color {
        switch status.lowercased() {
        case "completed", "approved", "success", "connected": return CompanionTheme.success
        case "failed", "rejected", "blocked": return CompanionTheme.danger
        case "queued", "pending", "running", "processing", "active": return CompanionTheme.accent
        default: return CompanionTheme.warning
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(status.capitalized)
                .font(CompanionTheme.caption)
                .foregroundStyle(CompanionTheme.mutedInk)
        }
        .accessibilityElement(children: .combine)
    }
}

struct CompanionActionButton: View {
    let title: String
    let role: ButtonRole?
    let action: () -> Void

    init(_ title: String, role: ButtonRole? = nil, action: @escaping () -> Void) {
        self.title = title
        self.role = role
        self.action = action
    }

    var body: some View {
        Button(title, role: role, action: action)
            .font(CompanionTheme.caption)
            .foregroundStyle(role == .destructive ? CompanionTheme.danger : CompanionTheme.accent)
            .buttonStyle(.plain)
            .padding(.vertical, 10)
            .accessibilityAddTraits(.isButton)
    }
}
