// Folders and files for content-factory projects:
// <output folder>/<brand>/<project>/...

const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/** A name that is safe as a folder on Windows, macOS and Linux. */
export function slugForFolder(name: string): string {
  let slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/[-.]+$/g, '');
  if (!slug) slug = 'untitled';
  if (WINDOWS_RESERVED.has(slug)) slug = `${slug}-folder`;
  return slug;
}
