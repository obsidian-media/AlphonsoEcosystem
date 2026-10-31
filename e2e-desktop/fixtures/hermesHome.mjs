// The test Hermes folder for hermes.e2e.mjs (Hermes gateway, 2026-10-30). wdio.conf.mjs gives the
// app HERMES_HOME pointing here for that spec only, so the app never reads a real Hermes folder;
// the spec writes a profile into it and deletes it afterwards.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const HERMES_HOME_FOR_TEST = join(tmpdir(), 'alphonso-e2e-hermes-home');
