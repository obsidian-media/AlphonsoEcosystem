// Alphonso's code step (agent phase 6): what he prepared before you approve it.
import type { WorkPlace } from './projects';

export interface CodeFile {
  path: string;
  content: string;
  status: 'new' | 'changed';
  before?: string;
  /** The old content's hash: a file changed on disk since the preview is not written. */
  beforeHash?: string;
  added: number;
  removed: number;
  /** Up to six lines, "- old" / "+ new", where the file first differs. */
  firstDiff: string[];
  /** You changed this file on the board before approving (agent roles Part C2). */
  editedByYou?: boolean;
}

export interface CodeCommand {
  program: string;
  args: string[];
  why: string;
  readOnly: boolean;
  level: 'low' | 'medium' | 'high';
  deletes: boolean;
}

export interface CodePreview {
  place: WorkPlace;
  plan: string;
  title: string;
  files: CodeFile[];
  commands: CodeCommand[];
  dropped: { path: string; reason: string }[];
  /** The model that wrote it ('' = Alphonso's own). */
  model: string;
  preparedAtMs: number;
  /** A file was edited by you before approving (agent roles Part C2). */
  edited?: boolean;
}
