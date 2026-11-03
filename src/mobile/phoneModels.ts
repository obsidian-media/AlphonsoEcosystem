// The phone's own models (phone phase 4, owner 2026-11-02): Apple's on-device model and OpenRouter's
// free models, given to the screens by mobile/src/native.ts. The key never reaches the screens:
// they can only save a new one or ask whether one is saved.
import type { PhoneAnswerParts } from '../services/phone/remoteData';

export interface AppleModelStatus { available: boolean; reason: string | null }

export interface PhoneOwnModels {
  answer: PhoneAnswerParts;
  modelStatus(): Promise<AppleModelStatus>;
  saveOpenRouterKey(key: string): Promise<void>;
  hasOpenRouterKey(): Promise<boolean>;
}

const WHY_NOT: Record<string, string> = {
  notIOS26: "Apple's model needs iOS 26 or later.",
  deviceNotEligible: "This iPhone can't run Apple's model.",
  appleIntelligenceNotEnabled: 'Apple Intelligence is off: turn it on in Settings → Apple Intelligence & Siri.',
  modelNotReady: "Apple's model is still downloading. Try again later.",
  android: "This phone's own model isn't supported yet.",
};

export function appleModelLine(status: AppleModelStatus): string {
  if (status.available) return "Apple's model is ready on this iPhone.";
  return WHY_NOT[status.reason || ''] || "Apple's model isn't available here.";
}
