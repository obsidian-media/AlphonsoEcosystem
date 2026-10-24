// Keeping a brand's character with ComfyUI (content factory phase 4c), free and on this
// computer: the character's reference pictures through a pinned image-reference model from
// Runtime Hub. Without that model the picture still mentions the character's description,
// and the note says how to keep the character properly.
import type { BrandCharacter } from './contentTypes';

export const CHARACTER_REFERENCE_MISSING = 'Install the character reference model in Runtime Hub to keep the character.';

/** Whether the character reference model is installed in the user's ComfyUI (Task 5 fills this in). */
export async function characterReferenceAvailable(): Promise<boolean> {
  return false;
}

/** The prompt with the character's description, so a picture without the reference model still shows them. */
export function withCharacterPrompt(prompt: string, character: BrandCharacter | null): string {
  if (!character?.description) return prompt;
  return [`${character.name}: ${character.description}`, prompt].filter(Boolean).join('. ');
}
