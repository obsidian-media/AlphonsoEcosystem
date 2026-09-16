import SwiftUI

/// Live Translator: sequential push-to-talk, NOT simultaneous bidirectional
/// interpretation -- see docs/HANDOFF-alphonso-language-companion.md in the
/// Boardroom repo for the explicit scope decision. Two people share one phone,
/// pick their two languages once, then alternate turns.
struct TranslatorView: View {
    @EnvironmentObject var voiceCloudService: VoiceCloudService
    @StateObject private var viewModel = TranslatorViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    TranslatorHeroCard(viewModel: viewModel)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Conversation languages")
                            .font(.headline)

                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Speaker A")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Picker("Speaker A language", selection: $viewModel.languageA) {
                                    ForEach(VoiceLanguage.allCases) { language in
                                        Text(language.title).tag(language)
                                    }
                                }
                                .pickerStyle(.menu)
                            }

                            Image(systemName: "arrow.left.arrow.right")
                                .foregroundStyle(.secondary)

                            VStack(alignment: .leading, spacing: 4) {
                                Text("Speaker B")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Picker("Speaker B language", selection: $viewModel.languageB) {
                                    ForEach(VoiceLanguage.allCases) { language in
                                        Text(language.title).tag(language)
                                    }
                                }
                                .pickerStyle(.menu)
                            }
                        }
                    }
                    .padding()
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                    Picker("Who's talking", selection: Binding(
                        get: { viewModel.currentTurn },
                        set: { viewModel.swapTurn(to: $0) }
                    )) {
                        Text("Speaker A (\(viewModel.languageA.title))").tag(TranslatorTurn.speakerA)
                        Text("Speaker B (\(viewModel.languageB.title))").tag(TranslatorTurn.speakerB)
                    }
                    .pickerStyle(.segmented)
                    .disabled(viewModel.phase != .idle)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Heard")
                            .font(.headline)

                        Text(viewModel.draftTranscript.isEmpty ? "Hold to talk in \(viewModel.speakingLanguage.title)..." : viewModel.draftTranscript)
                            .font(.body)
                            .foregroundStyle(viewModel.draftTranscript.isEmpty ? .secondary : .primary)
                            .frame(minHeight: 60, alignment: .topLeading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(.thinMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }

                    Button {
                        viewModel.toggleListening()
                    } label: {
                        Label(
                            viewModel.phase == .listening ? "Stop" : "Push to Talk (\(viewModel.speakingLanguage.title))",
                            systemImage: viewModel.phase == .listening ? "stop.circle.fill" : "mic.circle.fill"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(TranslatorPrimaryButtonStyle())
                    .disabled(!viewModel.canStartListening || (viewModel.phase != .idle && viewModel.phase != .listening))
                    .accessibilityIdentifier("translator-push-to-talk")

                    if viewModel.canRetryPlayback {
                        Button("Retry audio playback") {
                            viewModel.retryCloudPlayback()
                        }
                        .buttonStyle(.borderedProminent)
                    }

                    if !viewModel.cloudReady {
                        Text("Sign in to Cloud Voice (Voice tab) before using Live Translator -- it requires an enrolled device, same as Cloud Voice chat.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Label(viewModel.phaseTitle, systemImage: "waveform")
                        Spacer()
                        Text("Next: \(viewModel.currentTurn == .speakerA ? "Speaker A" : "Speaker B")")
                            .foregroundStyle(.secondary)
                    }
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 4)

                    if viewModel.transcript.isEmpty {
                        TranslatorEmptyState()
                    } else {
                        VStack(spacing: 10) {
                            ForEach(viewModel.transcript) { entry in
                                TranslatorTranscriptRow(entry: entry)
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Live Translator")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Clear") {
                        viewModel.resetConversation()
                    }
                    .disabled(viewModel.transcript.isEmpty && viewModel.draftTranscript.isEmpty)
                }
            }
            .onAppear {
                viewModel.attach(cloudService: voiceCloudService)
                viewModel.prepareForSession()
            }
            .onDisappear {
                viewModel.stopListening()
            }
        }
    }
}

private struct TranslatorHeroCard: View {
    @ObservedObject var viewModel: TranslatorViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Live Translator")
                        .font(.title2.bold())
                    Text("Pass the phone back and forth. Each side holds to talk in their own language; the other hears it translated and spoken back.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "person.2.wave.2.fill")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(14)
                    .background(
                        LinearGradient(
                            colors: [Color.orange.opacity(0.95), Color.pink.opacity(0.8)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(Circle())
            }

            Label(viewModel.statusMessage, systemImage: "sparkles")
                .font(.caption.weight(.semibold))
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

private struct TranslatorTranscriptRow: View {
    let entry: TranslatorTranscriptEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(entry.turn == .speakerA ? "Speaker A" : "Speaker B") -- \(entry.spokenLanguage.title) -> \(entry.translatedLanguage.title)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Text(entry.originalText)
                .font(.callout)
                .foregroundStyle(.secondary)

            Text(entry.translatedText)
                .font(.body)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(uiColor: .secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            if entry.delivery == .textOnly {
                Text("Text only -- audio unavailable")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
        }
    }
}

private struct TranslatorEmptyState: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "person.2.wave.2")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("No translations yet")
                .font(.headline)
            Text("Pick each speaker's language, then hold to talk.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}

private struct TranslatorPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .padding(.vertical, 14)
            .padding(.horizontal, 14)
            .foregroundStyle(.white)
            .background(
                LinearGradient(
                    colors: [Color.orange.opacity(0.95), Color.pink.opacity(0.8)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .opacity(configuration.isPressed ? 0.8 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
