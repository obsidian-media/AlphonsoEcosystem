// A brand's consistent characters (content factory phase 4c): a made-up mascot or presenter,
// or a real person from their own photos (only with the saved permission tick). Pictures live
// in `<output folder>/<brand>/characters/<id>/` and never leave this computer except in the one
// Higgsfield training request (contentCharacterTraining.ts).
import { invoke } from '@tauri-apps/api/core';
import { generateComfyUiImage, getComfyUiEndpoint } from '../connectors/connectorImageGenerators';
import { higgsfieldKeys } from '../connectors/higgsfieldConnector';
import { randomHex, randomId } from '../../lib/randomId';
import { getBrand, saveBrand } from './contentBrandService';
import { outputPath, requireOutputRoot } from './contentProjectFiles';
import type { BrandCharacter, ContentBrand } from './contentTypes';

type Settings = { outputFolder?: string | null };

export const MIN_CHARACTER_PICTURES = 5;
export const MAX_CHARACTER_PICTURES = 20;
export const MIYA_CHARACTER_PICTURES = 8;
export const NEEDS_PERMISSION = 'Tick that this is you or that you have permission first.';
export const NEEDS_PICTURES = `Add at least ${MIN_CHARACTER_PICTURES} pictures.`;
export const REAL_PERSON_OWN_PHOTOS = 'Add your own photos for a real person.';

/** The angles Miya draws a made-up character from, so training sees it from every side. */
const ANGLES = [
  'front view, looking at the camera', 'three-quarter view from the left', 'three-quarter view from the right',
  'side view', 'smiling, upper body', 'full body, standing', 'close-up portrait', 'waving, upper body',
];

function brandOrThrow(brandId: string): ContentBrand {
  const brand = getBrand(brandId);
  if (!brand) throw new Error('That brand no longer exists.');
  return brand;
}

function changeCharacters(brandId: string, change: (list: BrandCharacter[], brand: ContentBrand) => Partial<ContentBrand> | void): ContentBrand {
  const brand = brandOrThrow(brandId);
  const list = [...(brand.characters || [])];
  const extra = change(list, brand) || {};
  return saveBrand({ ...brand, ...extra, characters: list });
}

export function listCharacters(brandId: string): BrandCharacter[] {
  return getBrand(brandId)?.characters || [];
}

export function getCharacter(brand: Pick<ContentBrand, 'characters'>, id: string | null | undefined): BrandCharacter | null {
  return (id && brand.characters?.find((c) => c.id === id)) || null;
}

export function addCharacter(brandId: string, input: { name: string; kind: BrandCharacter['kind']; description: string }): BrandCharacter {
  const character: BrandCharacter = {
    id: randomId('char'), name: input.name.trim() || 'Character', kind: input.kind, description: input.description.trim(), pictures: [],
  };
  changeCharacters(brandId, (list, brand) => {
    list.push(character);
    return brand.mainCharacterId ? {} : { mainCharacterId: character.id };
  });
  return character;
}

export function updateCharacter(brandId: string, id: string, patch: Partial<Omit<BrandCharacter, 'id'>>): BrandCharacter | null {
  let updated: BrandCharacter | null = null;
  changeCharacters(brandId, (list) => {
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return;
    updated = { ...list[i], ...patch, id };
    list[i] = updated;
  });
  return updated;
}

export function setMainCharacter(brandId: string, id: string | null): void {
  changeCharacters(brandId, () => ({ mainCharacterId: id || undefined }));
}

/** A real person only: the tick and when it was given; unticking removes it. */
export function setPermission(brandId: string, id: string, on: boolean): void {
  changeCharacters(brandId, (list) => {
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return;
    const { permission: _old, ...rest } = list[i];
    list[i] = on ? { ...rest, permission: { atMs: Date.now() } } : rest;
  });
}

/** Whether a character can be trained or used; otherwise a plain reason. */
export function characterUsable(c: BrandCharacter): { ok: boolean; reason?: string } {
  if (c.kind === 'real_person' && !c.permission) return { ok: false, reason: NEEDS_PERMISSION };
  if (c.pictures.length < MIN_CHARACTER_PICTURES) return { ok: false, reason: NEEDS_PICTURES };
  return { ok: true };
}

function characterDir(brand: ContentBrand, id: string): string {
  return `${brand.folderName}/characters/${id}`;
}

function cleanBase(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return stem || 'picture';
}

/** Saves pictures (raw base64) into the character's folder, each under a new name. */
export async function addCharacterPictures(brandId: string, id: string, files: { name: string; base64: string }[], settings: Settings): Promise<string[]> {
  const brand = brandOrThrow(brandId);
  const character = getCharacter(brand, id);
  if (!character) throw new Error('That character no longer exists.');
  const root = requireOutputRoot(settings);
  const room = MAX_CHARACTER_PICTURES - character.pictures.length;
  const added: string[] = [];
  for (const file of files.slice(0, Math.max(0, room))) {
    const filename = `${cleanBase(file.name)}-${randomHex(4)}.png`;
    await invoke('save_image_to_folder', { base64Data: file.base64, filename, folder: outputPath(root, characterDir(brand, id)) });
    added.push(`${characterDir(brand, id)}/${filename}`);
  }
  const latest = getCharacter(brandOrThrow(brandId), id);
  if (latest) updateCharacter(brandId, id, { pictures: [...latest.pictures, ...added] });
  return added;
}

export function removeCharacterPicture(brandId: string, id: string, path: string): void {
  const character = getCharacter(brandOrThrow(brandId), id);
  if (!character) return;
  updateCharacter(brandId, id, {
    pictures: character.pictures.filter((p) => p !== path),
    ...(character.comfyPictures ? { comfyPictures: character.comfyPictures.filter((p) => p !== path) } : {}),
  });
}

/** Miya draws a made-up character from its description, 8 times from different angles, with ComfyUI. */
export async function makeCharacterPictures(brandId: string, id: string, settings: Settings): Promise<{ made: number; failed: number }> {
  const brand = brandOrThrow(brandId);
  const character = getCharacter(brand, id);
  if (!character) throw new Error('That character no longer exists.');
  if (character.kind === 'real_person') throw new Error(REAL_PERSON_OWN_PHOTOS);
  requireOutputRoot(settings);
  let made = 0;
  let failed = 0;
  for (const [i, angle] of ANGLES.slice(0, MIYA_CHARACTER_PICTURES).entries()) {
    const look = [character.description, brand.visualStyle].filter(Boolean).join(', ');
    let result: { ok?: boolean; previewBase64?: string } | null = null;
    try {
      result = await generateComfyUiImage(
        { prompt: `${look}, ${angle}, the same character every time, plain background`, width: 768, height: 768 },
        { endpoint: getComfyUiEndpoint() },
      ) as { ok?: boolean; previewBase64?: string };
    } catch {
      result = null;
    }
    if (result?.ok && result.previewBase64) {
      await addCharacterPictures(brandId, id, [{ name: `miya-${i + 1}`, base64: result.previewBase64 }], settings);
      made += 1;
    } else {
      failed += 1;
    }
  }
  return { made, failed };
}

/** Deletes the character, its pictures on this computer and its training on Higgsfield. */
export async function deleteCharacter(brandId: string, id: string, settings: Settings): Promise<void> {
  const brand = brandOrThrow(brandId);
  const character = getCharacter(brand, id);
  if (!character) return;
  const root = requireOutputRoot(settings);
  for (const path of character.pictures) {
    await invoke('delete_workspace_file', { workspaceRoot: root, relativePath: path }).catch(() => undefined);
  }
  // Higgsfield's copy of the training goes too, where it allows.
  if (character.higgsfield?.requestId) {
    await invoke('higgsfield_delete_request', { requestId: character.higgsfield.requestId, keys: higgsfieldKeys() }).catch(() => undefined);
  }
  changeCharacters(brandId, (list, b) => {
    const i = list.findIndex((c) => c.id === id);
    if (i >= 0) list.splice(i, 1);
    return b.mainCharacterId === id ? { mainCharacterId: undefined } : {};
  });
}
