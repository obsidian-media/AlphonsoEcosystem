import React, { useState } from 'react';
import { Button } from '../ui';
import { ProjectPicture } from './ProjectPicture';
import { getBrand } from '../../services/contentFactory/contentBrandService';
import {
  addCharacter, addCharacterPictures, characterUsable, deleteCharacter, makeCharacterPictures, removeCharacterPicture,
  setMainCharacter, setPermission, updateCharacter,
} from '../../services/contentFactory/contentCharacters';
import { contentAppSettings } from '../../services/contentFactory/contentStepRecorder';
import type { BrandCharacter } from '../../services/contentFactory/contentTypes';

const field = 'rounded-lg bg-(--surface-2) px-2 py-1 text-[12px] text-(--text-1)';

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^;]+;base64,/, ''));
    reader.onerror = () => reject(new Error('The picture could not be read.'));
    reader.readAsDataURL(file);
  });
}

/** The Brands tab's characters (phase 4c): made-up or a real person, pictures, the main one. */
export function CharactersEditor({ brandId, children }: { brandId: string; children?: (c: BrandCharacter, refresh: () => void) => React.ReactNode }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BrandCharacter['kind']>('made_up');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const brand = getBrand(brandId);
  if (!brand) return null;
  const settings = contentAppSettings();
  const outputRoot = String(settings.outputFolder || '');
  const say = (id: string, text: string) => setNotes((n) => ({ ...n, [id]: text }));
  const run = async (id: string, work: () => Promise<string>) => {
    try { say(id, await work()); } catch (error) { say(id, (error as Error).message); }
    refresh();
  };

  return (
    <section className="space-y-3" aria-label="Characters">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-(--text-3)">Characters</div>
      <p className="text-[11px] text-(--text-3)">The same person or mascot in every scene, thumbnail and Short. A real person's photos stay on this computer, except when sent once to train on Higgsfield.</p>
      {(brand.characters || []).map((c) => {
        const usable = characterUsable(c);
        return (
          <div key={c.id} className="space-y-2 rounded-xl bg-(--surface-1) p-3 text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label={`Character name: ${c.name}`} className={field} value={c.name} onChange={(e) => { updateCharacter(brandId, c.id, { name: e.target.value }); refresh(); }} />
              <span className="text-(--text-3)">{c.kind === 'real_person' ? 'Real person' : 'Made up'}</span>
              <label className="flex items-center gap-1 text-(--text-2)">
                <input type="radio" name={`main-${brandId}`} aria-label={`Main character: ${c.name}`} checked={brand.mainCharacterId === c.id} onChange={() => { setMainCharacter(brandId, c.id); refresh(); }} />
                Main character
              </label>
              <Button size="sm" variant="secondary" onClick={() => { void run(c.id, async () => { await deleteCharacter(brandId, c.id, settings); return ''; }); }}>Delete</Button>
            </div>
            <textarea aria-label={`Character description: ${c.name}`} className={`${field} w-full`} rows={2} placeholder="What they look like: face, hair, clothes, colours"
              value={c.description} onChange={(e) => { updateCharacter(brandId, c.id, { description: e.target.value }); refresh(); }} />
            {c.kind === 'real_person' && (
              <label className="flex items-center gap-2 text-(--text-2)">
                <input type="checkbox" aria-label="This is me, or I have this person's permission" checked={Boolean(c.permission)}
                  onChange={(e) => { setPermission(brandId, c.id, e.target.checked); refresh(); }} />
                This is me, or I have this person's permission
                {c.permission && <span className="text-(--text-3)">(ticked {new Date(c.permission.atMs).toLocaleDateString()})</span>}
              </label>
            )}
            <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
              {c.pictures.map((p) => (
                <div key={p} className="space-y-1">
                  <ProjectPicture outputRoot={outputRoot} relativePath={p} alt={c.name} className="aspect-square w-full" />
                  <button type="button" className="text-[11px] text-(--text-3)" onClick={() => { removeCharacterPicture(brandId, c.id, p); refresh(); }}>Remove</button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="rounded-lg bg-(--surface-2) px-2 py-1 text-(--text-2)">
                Add pictures
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" aria-label={`Add pictures: ${c.name}`}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    void run(c.id, async () => {
                      const read = await Promise.all(files.map(async (f) => ({ name: f.name, base64: await readAsBase64(f) })));
                      const added = await addCharacterPictures(brandId, c.id, read, settings);
                      return `${added.length} picture${added.length === 1 ? '' : 's'} added.`;
                    });
                  }} />
              </label>
              {c.kind === 'made_up' && (
                <Button size="sm" variant="secondary" onClick={() => {
                  say(c.id, 'Miya is making pictures…');
                  void run(c.id, async () => {
                    const made = await makeCharacterPictures(brandId, c.id, settings);
                    return `Miya made ${made.made} pictures.${made.failed ? ` ${made.failed} could not be made.` : ''}`;
                  });
                }}>Make pictures with Miya</Button>
              )}
              {!usable.ok && <span className="text-[11px] text-(--warning)">{usable.reason}</span>}
              {notes[c.id] && <span className="text-[11px] text-(--text-3)">{notes[c.id]}</span>}
            </div>
            {children?.(c, refresh)}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="New character name" className={field} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="New character kind" className={field} value={kind} onChange={(e) => setKind(e.target.value as BrandCharacter['kind'])}>
          <option value="made_up">Made up (a mascot or presenter)</option>
          <option value="real_person">A real person</option>
        </select>
        <Button size="sm" onClick={() => { if (!name.trim()) return; addCharacter(brandId, { name, kind, description: '' }); setName(''); refresh(); }}>Add character</Button>
      </div>
    </section>
  );
}
