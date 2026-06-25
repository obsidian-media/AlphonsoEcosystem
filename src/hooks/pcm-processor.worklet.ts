// AudioWorklet processor — runs in audio thread
// NOTE: This file must NOT import anything — worklet scope is isolated
class PcmProcessor extends AudioWorkletNode {
  // This is a placeholder — the actual worklet runs as a string blob
}

// The worklet code as a string (injected at registration time)
export const PCM_WORKLET_CODE = `
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const pcm = new Int16Array(input[0].length);
      for (let i = 0; i < input[0].length; i++) {
        pcm[i] = Math.max(-32768, Math.min(32767, input[0][i] * 32767));
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PcmProcessor);
`;
