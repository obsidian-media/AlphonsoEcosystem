import SwiftUI

enum CompanionTheme {
    static let canvas = Color(red: 0.035, green: 0.035, blue: 0.045) // Pure OLED Midnight (#09090B)
    static let surface = Color(red: 0.078, green: 0.078, blue: 0.098) // Bespoke Deep-Dark Card Surface (#14141A)
    static let ink = Color(red: 0.98, green: 0.98, blue: 1.0) // Crisp Editorial Bone White (#FAFAFA)
    static let mutedInk = Color(red: 0.63, green: 0.63, blue: 0.70) // Softened Slate Secondary (#A1A1AA)
    static let quietInk = Color(red: 0.45, green: 0.45, blue: 0.52) // Muted Zinc Tertiary (#71717A)
    static let rule = Color(red: 0.15, green: 0.15, blue: 0.18) // Ultra-Thin Slate Separator (#27272A)
    static let accent = Color(red: 0.42, green: 0.44, blue: 0.94) // Electric Indigo Accent
    static let success = Color(red: 0.10, green: 0.74, blue: 0.45) // Neon Jade Success
    static let warning = Color(red: 0.95, green: 0.60, blue: 0.10) // Electric Amber Warning
    static let danger = Color(red: 0.94, green: 0.27, blue: 0.31) // Laser Ruby Red Danger

    static let display = Font.system(size: 34, weight: .bold, design: .serif)
    static let title = Font.system(size: 19, weight: .semibold, design: .rounded)
    static let section = Font.system(size: 11, weight: .bold, design: .monospaced)
    static let body = Font.system(size: 15, weight: .regular, design: .rounded)
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
