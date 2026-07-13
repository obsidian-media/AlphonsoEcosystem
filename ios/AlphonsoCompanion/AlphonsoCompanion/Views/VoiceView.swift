import SwiftUI
import UIKit

struct VoiceView: View {
    @EnvironmentObject var webSocketService: WebSocketService
    @StateObject private var viewModel = VoiceSessionViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    VoiceHeroCard(viewModel: viewModel)

                    Picker("Voice mode", selection: Binding(
                        get: { viewModel.mode },
                        set: { viewModel.selectMode($0) }
                    )) {
                        ForEach(VoiceMode.allCases) { mode in
                            Label(mode.title, systemImage: mode.systemImage)
                                .tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    VoiceModeCard(mode: viewModel.mode)

                    if viewModel.mode == .cloud {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Cloud backend")
                                .font(.headline)

                            TextField("Cloud endpoint URL", text: $viewModel.cloudEndpoint)
                                .textFieldStyle(.roundedBorder)
                                .keyboardType(.URL)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()

                            SecureField("Cloud API key (optional)", text: $viewModel.cloudAPIKey)
                                .textFieldStyle(.roundedBorder)

                            Button("Save endpoint") {
                                viewModel.configureCloudEndpoint(
                                    viewModel.cloudEndpoint,
                                    apiKey: viewModel.cloudAPIKey
                                )
                            }
                            .buttonStyle(.borderedProminent)

                            Text(viewModel.cloudStatus)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding()
                        .background(.thinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Transcript")
                            .font(.headline)

                        TextEditor(text: $viewModel.draftTranscript)
                            .frame(minHeight: 120)
                            .padding(10)
                            .background(.thinMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .strokeBorder(Color.white.opacity(0.12), lineWidth: 1)
                            }
                            .accessibilityIdentifier("voice-draft-transcript")
                    }

                    HStack(spacing: 12) {
                        Button {
                            viewModel.toggleListening()
                        } label: {
                            Label(
                                viewModel.phase == .listening ? "Stop" : "Push to Talk",
                                systemImage: viewModel.phase == .listening ? "stop.circle.fill" : "mic.circle.fill"
                            )
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(VoicePrimaryButtonStyle(mode: viewModel.mode))
                        .accessibilityIdentifier("voice-push-to-talk")

                        Button("Send") {
                            viewModel.submitDraft()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.secondary)
                        .disabled(!viewModel.canSend || (viewModel.mode == .cloud && viewModel.cloudEndpoint.isEmpty))
                        .accessibilityIdentifier("voice-send")
                    }

                    HStack {
                        Label(viewModel.phaseTitle, systemImage: "waveform")
                        Spacer()
                        Text(viewModel.providerTitle)
                            .foregroundStyle(.secondary)
                    }
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 4)

                    if viewModel.transcript.isEmpty {
                        VoiceEmptyState(mode: viewModel.mode)
                    } else {
                        VStack(spacing: 10) {
                            ForEach(viewModel.transcript) { entry in
                                VoiceTranscriptRow(entry: entry)
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Voice")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Clear") {
                        viewModel.resetConversation()
                    }
                    .disabled(viewModel.transcript.isEmpty && viewModel.draftTranscript.isEmpty)
                }
            }
            .onAppear {
                viewModel.prepareForVoiceSession()
                viewModel.setLocalTranscriptSender { text in
                    _ = webSocketService.sendCommand(text: text)
                }
            }
            .onDisappear {
                viewModel.stopListening()
            }
            .onChange(of: webSocketService.isStreaming) { _, isStreaming in
                guard !isStreaming, let lastMessage = webSocketService.messages.last else { return }
                viewModel.handleIncomingDesktopReply(lastMessage)
            }
            .onChange(of: webSocketService.messages.count) { _, _ in
                guard !webSocketService.isStreaming, let lastMessage = webSocketService.messages.last else { return }
                viewModel.handleIncomingDesktopReply(lastMessage)
            }
        }
    }
}

private struct VoiceHeroCard: View {
    @ObservedObject var viewModel: VoiceSessionViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Talk to Alphonso")
                        .font(.title2.bold())
                    Text("Push to talk now. Local mode speaks through the desktop. Cloud mode routes to the Railway voice backend.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "mic.fill")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(14)
                    .background(
                        LinearGradient(
                            colors: viewModel.mode.accentColors,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(Circle())
            }

            HStack(spacing: 8) {
                Label(viewModel.statusMessage, systemImage: "sparkles")
                    .font(.caption.weight(.semibold))
                Spacer()
            }
            .foregroundStyle(.secondary)

            Text(viewModel.permissionStatus)
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Color.white.opacity(0.15), lineWidth: 1)
        }
    }
}

private struct VoiceModeCard: View {
    let mode: VoiceMode

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: mode.systemImage)
                .font(.title2)
                .frame(width: 42, height: 42)
                .background(
                    LinearGradient(
                        colors: mode.accentColors,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .foregroundStyle(.white)

            VStack(alignment: .leading, spacing: 4) {
                Text(mode.title)
                    .font(.headline)
                Text(mode.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding()
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct VoiceTranscriptRow: View {
    let entry: VoiceTranscriptEntry

    var body: some View {
        HStack {
            if entry.speaker == .user { Spacer(minLength: 40) }

            VStack(alignment: entry.speaker == .user ? .trailing : .leading, spacing: 6) {
                Text(entry.speaker == .user ? "You" : "Alphonso")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(entry.text)
                    .font(.body)
                    .padding(12)
                    .background(
                        entry.speaker == .user ?
                            Color.accentColor :
                            Color(uiColor: .secondarySystemBackground)
                    )
                    .foregroundColor(entry.speaker == .user ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                Text(entry.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            if entry.speaker == .alphonso { Spacer(minLength: 40) }
        }
    }
}

private struct VoiceEmptyState: View {
    let mode: VoiceMode

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "wave.3.right")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("No voice messages yet")
                .font(.headline)
            Text("Start with push to talk in \(mode.title.lowercased()) mode.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}

private struct VoicePrimaryButtonStyle: ButtonStyle {
    let mode: VoiceMode

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .padding(.vertical, 14)
            .padding(.horizontal, 14)
            .foregroundStyle(.white)
            .background(
                LinearGradient(
                    colors: mode.accentColors,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .opacity(configuration.isPressed ? 0.8 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
