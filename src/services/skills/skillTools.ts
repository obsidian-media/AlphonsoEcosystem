// The tools skills may name (agent roles Part B). Each wraps something an
// agent already does (skillToolRun.ts); none is a new connector. A tool lists
// the effects it needs and the agents that may use it.
import type { JoseEffect } from '../jose/joseEffects';

export interface SkillTool {
  effects: JoseEffect[];
  agents: string[];
  label: string;
}

const WORKERS = ['alphonso', 'miya', 'hector', 'nova', 'maria', 'sentinel', 'marcus', 'echo'];

export const SKILL_TOOLS: Record<string, SkillTool> = {
  read_step_output: { effects: ['read'], agents: WORKERS, label: 'Read an earlier step’s work' },
  read_memory: { effects: ['read'], agents: WORKERS, label: 'Read memory' },
  save_note: { effects: ['write_own_work'], agents: WORKERS, label: 'Save a note to memory' },
  web_search: { effects: ['read'], agents: ['hector'], label: 'Search the web' },
  fetch_source: { effects: ['read'], agents: ['hector'], label: 'Open a source' },
  stock_search: { effects: ['read'], agents: ['hector'], label: 'Search stock footage' },
  read_sources: { effects: ['read'], agents: ['maria', 'nova', 'sentinel'], label: 'Read the sources earlier steps used' },
  read_source_page: { effects: ['read'], agents: ['maria', 'nova', 'sentinel'], label: 'Read a research source in full, by its number' },
  read_bookmarks: { effects: ['read'], agents: ['hector'], label: 'Read the sources you saved' },
  make_picture: { effects: ['write_own_work'], agents: ['miya'], label: 'Make a picture' },
  make_voice: { effects: ['write_own_work'], agents: ['miya'], label: 'Read a voice-over' },
  make_music: { effects: ['write_own_work'], agents: ['miya'], label: 'Make music' },
  assemble_video: { effects: ['write_own_work'], agents: ['miya'], label: 'Put the video together' },
  read_project_file: { effects: ['read'], agents: ['alphonso', 'maria', 'sentinel'], label: 'Read a project file' },
  run_command: { effects: ['run'], agents: ['alphonso'], label: 'Run a command' },
  write_project_file: { effects: ['change_project'], agents: ['alphonso'], label: 'Change a project file' },
  send_message: { effects: ['publish_or_send'], agents: ['marcus'], label: 'Send a message' },
  publish_post: { effects: ['publish_or_send'], agents: ['marcus'], label: 'Publish a post' },
  place_call: { effects: ['publish_or_send', 'spend'], agents: ['marcus'], label: 'Place a call' },
  organise_memory: { effects: ['read'], agents: ['echo'], label: 'Look over memory for duplicates' },
  read_brand: { effects: ['read'], agents: ['maria', 'miya'], label: 'Read a brand’s voice' },
  // Read-only Composio actions (agent phase 5); anything that sends is Marcus's step.
  composio_read: { effects: ['read'], agents: ['hector', 'echo', 'alphonso'], label: 'Read from a Composio app' },
};

/** Tools that make or send something: they run as the step's own action, after its approval. */
export const ACTION_TOOLS = new Set(['make_picture', 'make_voice', 'make_music', 'assemble_video', 'run_command', 'write_project_file', 'send_message', 'publish_post', 'place_call']);

export function toolsFor(agent: string): string[] {
  return Object.entries(SKILL_TOOLS).filter(([, tool]) => tool.agents.includes(agent)).map(([name]) => name);
}
