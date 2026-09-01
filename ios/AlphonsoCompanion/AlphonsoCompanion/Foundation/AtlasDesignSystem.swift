import SwiftUI

/// The semantic design layer for the full-mobile Alphonso product.
/// Feature views should use this layer instead of hard-coded presentation values.
enum AtlasTheme {
    enum ColorToken {
        static let mineral = Color(red: 0.969, green: 0.957, blue: 0.929)
        static let sheet = Color(red: 1.0, green: 0.988, blue: 0.969)
        static let ink = Color(red: 0.098, green: 0.125, blue: 0.110)
        static let mutedInk = Color(red: 0.365, green: 0.404, blue: 0.373)
        static let quietInk = Color(red: 0.525, green: 0.557, blue: 0.529)
        static let rule = Color(red: 0.843, green: 0.824, blue: 0.780)
        static let moss = Color(red: 0.090, green: 0.380, blue: 0.357)
        static let cobalt = Color(red: 0.192, green: 0.369, blue: 0.616)
        static let clay = Color(red: 0.722, green: 0.286, blue: 0.169)
        static let amber = Color(red: 0.596, green: 0.420, blue: 0.082)
        static let focusCanvas = Color(red: 0.098, green: 0.125, blue: 0.110)
        static let focusSheet = Color(red: 0.125, green: 0.149, blue: 0.125)
        static let focusInk = Color(red: 0.965, green: 0.957, blue: 0.929)
        static let focusMutedInk = Color(red: 0.749, green: 0.780, blue: 0.745)
        static let focusRule = Color(red: 0.224, green: 0.267, blue: 0.231)
    }

    enum Spacing {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
        static let xxl: CGFloat = 48
    }

    enum Radius {
        static let label: CGFloat = 4
        static let control: CGFloat = 12
        static let sheet: CGFloat = 18
        static let focalSheet: CGFloat = 24
    }

    enum Typography {
        static let display = Font.system(.largeTitle, design: .serif).weight(.semibold)
        static let title = Font.system(.title3, design: .default).weight(.semibold)
        static let section = Font.subheadline.weight(.semibold)
        static let body = Font.body
        static let metadata = Font.caption
        static let proof = Font.system(.caption, design: .monospaced).weight(.medium)
    }
}

enum AtlasExecutionPosture: String, CaseIterable, Codable, Identifiable {
    case cloud = "Cloud"
    case hybrid = "Hybrid"
    case local = "Local"
    case onDevice = "On-device"

    var id: String { rawValue }

    private var wireValue: String {
        switch self {
        case .cloud: return "cloud"
        case .hybrid: return "hybrid"
        case .local: return "local"
        case .onDevice: return "on_device"
        }
    }

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer().decode(String.self).lowercased()
        guard let posture = Self.allCases.first(where: { $0.wireValue == value }) else {
            throw DecodingError.dataCorruptedError(in: try decoder.singleValueContainer(), debugDescription: "Unsupported execution posture: \(value)")
        }
        self = posture
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wireValue)
    }

    var symbol: String {
        switch self {
        case .cloud: return "cloud"
        case .hybrid: return "rectangle.3.group.bubble.left"
        case .local: return "desktopcomputer"
        case .onDevice: return "iphone"
        }
    }

    var detail: String {
        switch self {
        case .cloud: return "Managed workspace"
        case .hybrid: return "Connected private workspace"
        case .local: return "Nearby companion"
        case .onDevice: return "Private on this device"
        }
    }

    var color: Color {
        switch self {
        case .cloud: return AtlasTheme.ColorToken.cobalt
        case .hybrid: return AtlasTheme.ColorToken.moss
        case .local: return AtlasTheme.ColorToken.amber
        case .onDevice: return AtlasTheme.ColorToken.mutedInk
        }
    }
}

enum AtlasRunStatus: String {
    case planned = "Planned"
    case awaitingDecision = "Needs decision"
    case executing = "Executing"
    case waiting = "Waiting"
    case delivered = "Delivered"
    case failed = "Needs recovery"

    var color: Color {
        switch self {
        case .planned: return AtlasTheme.ColorToken.cobalt
        case .awaitingDecision: return AtlasTheme.ColorToken.clay
        case .executing: return AtlasTheme.ColorToken.moss
        case .waiting: return AtlasTheme.ColorToken.amber
        case .delivered: return AtlasTheme.ColorToken.moss
        case .failed: return AtlasTheme.ColorToken.clay
        }
    }

    var symbol: String {
        switch self {
        case .planned: return "calendar"
        case .awaitingDecision: return "exclamationmark.shield"
        case .executing: return "arrow.triangle.2.circlepath"
        case .waiting: return "pause.circle"
        case .delivered: return "checkmark.seal"
        case .failed: return "exclamationmark.triangle"
        }
    }
}

struct AtlasPage<Content: View>: View {
    let focus: Bool
    let content: Content

    init(focus: Bool = false, @ViewBuilder content: () -> Content) {
        self.focus = focus
        self.content = content()
    }

    var body: some View {
        ScrollView {
            content
                .frame(maxWidth: 720, alignment: .leading)
                .padding(.horizontal, AtlasTheme.Spacing.lg)
                .padding(.vertical, AtlasTheme.Spacing.xl)
        }
        .background(focus ? AtlasTheme.ColorToken.focusCanvas : AtlasTheme.ColorToken.mineral)
    }
}

struct AtlasRule: View {
    let focus: Bool

    init(focus: Bool = false) {
        self.focus = focus
    }

    var body: some View {
        Rectangle()
            .fill(focus ? AtlasTheme.ColorToken.focusRule : AtlasTheme.ColorToken.rule)
            .frame(height: 1)
    }
}

struct AtlasSectionHeader: View {
    let title: String
    let detail: String?
    let focus: Bool

    init(_ title: String, detail: String? = nil, focus: Bool = false) {
        self.title = title
        self.detail = detail
        self.focus = focus
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.xxs) {
            Text(title.uppercased())
                .font(AtlasTheme.Typography.proof)
                .tracking(1.15)
                .foregroundStyle(focus ? AtlasTheme.ColorToken.focusMutedInk : AtlasTheme.ColorToken.mutedInk)
            if let detail {
                Text(detail)
                    .font(AtlasTheme.Typography.metadata)
                    .foregroundStyle(focus ? AtlasTheme.ColorToken.focusMutedInk : AtlasTheme.ColorToken.quietInk)
            }
        }
        .padding(.top, AtlasTheme.Spacing.lg)
        .padding(.bottom, AtlasTheme.Spacing.xs)
    }
}

struct AtlasPostureBadge: View {
    let posture: AtlasExecutionPosture
    let freshness: String
    let focus: Bool

    init(_ posture: AtlasExecutionPosture, freshness: String, focus: Bool = false) {
        self.posture = posture
        self.freshness = freshness
        self.focus = focus
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: posture.symbol)
            Text(posture.rawValue)
            Text("·")
            Text(freshness)
        }
        .font(AtlasTheme.Typography.metadata.weight(.semibold))
        .foregroundStyle(focus ? AtlasTheme.ColorToken.focusInk : posture.color)
        .padding(.horizontal, AtlasTheme.Spacing.sm)
        .padding(.vertical, 7)
        .background((focus ? AtlasTheme.ColorToken.focusSheet : posture.color.opacity(0.11)))
        .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.label, style: .continuous))
        .accessibilityLabel("\(posture.rawValue) execution posture, \(freshness)")
    }
}

struct AtlasStatusLabel: View {
    let status: AtlasRunStatus
    let focus: Bool

    init(_ status: AtlasRunStatus, focus: Bool = false) {
        self.status = status
        self.focus = focus
    }

    var body: some View {
        Label(status.rawValue, systemImage: status.symbol)
            .font(AtlasTheme.Typography.metadata.weight(.semibold))
            .foregroundStyle(focus ? AtlasTheme.ColorToken.focusInk : status.color)
            .accessibilityLabel("Status: \(status.rawValue)")
    }
}

struct AtlasPrimaryButton: View {
    let title: String
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(AtlasTheme.Typography.section)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AtlasTheme.Spacing.md)
        }
        .foregroundStyle(AtlasTheme.ColorToken.sheet)
        .background(AtlasTheme.ColorToken.moss)
        .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))
        .accessibilityHint("Creates work in the selected workspace")
    }
}

struct AtlasLedgerRow: View {
    let title: String
    let detail: String
    let stamp: String
    let status: AtlasRunStatus
    let posture: AtlasExecutionPosture
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: AtlasTheme.Spacing.sm) {
                VStack(spacing: 0) {
                    Circle()
                        .fill(status.color)
                        .frame(width: 8, height: 8)
                        .padding(.top, 5)
                    Rectangle()
                        .fill(AtlasTheme.ColorToken.rule)
                        .frame(width: 1)
                }
                .frame(width: 12)

                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(title)
                            .font(AtlasTheme.Typography.title)
                            .foregroundStyle(AtlasTheme.ColorToken.ink)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: AtlasTheme.Spacing.sm)
                        AtlasStatusLabel(status)
                    }
                    Text(detail)
                        .font(AtlasTheme.Typography.body)
                        .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: AtlasTheme.Spacing.xs) {
                        Text(stamp)
                            .font(AtlasTheme.Typography.proof)
                        Label(posture.rawValue, systemImage: posture.symbol)
                            .font(AtlasTheme.Typography.metadata.weight(.semibold))
                    }
                    .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                }
                .padding(.bottom, AtlasTheme.Spacing.lg)
            }
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens the full work record")
    }
}

struct AtlasEmptyState: View {
    let symbol: String
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(AtlasTheme.ColorToken.moss)
            Text(title)
                .font(AtlasTheme.Typography.title)
                .foregroundStyle(AtlasTheme.ColorToken.ink)
            Text(detail)
                .font(AtlasTheme.Typography.body)
                .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(AtlasTheme.Spacing.lg)
        .background(AtlasTheme.ColorToken.sheet)
        .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.sheet, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AtlasTheme.Radius.sheet, style: .continuous)
                .stroke(AtlasTheme.ColorToken.rule, lineWidth: 1)
        }
    }
}
