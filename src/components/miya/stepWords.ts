// Miya Studio's names for its steps and their states, shared by the computer's Studio and
// the phone's (phone app phase 2). No services here, so the phone app can import it.
import type { StepId, StepStatus } from '../../services/contentFactory/contentTypes';

export const STEP_LABELS: Record<StepId, string> = {
  brief: 'Brief',
  research: 'Research',
  script: 'Script',
  review: 'Review',
  scenes: 'Scenes',
  thumbnail: 'Thumbnails',
  voice: 'Voice-over',
  music: 'Music',
  sfx: 'Sound effects',
  broll: 'Stock clips',
  clips: 'AI clips',
  assemble: 'Finished video',
  shorts: 'Shorts',
  carousel: 'Carousel',
  campaign: 'Campaign',
  quality: 'Quality gate',
  publish: 'Publish',
};

export const STATUS_TEXT: Record<StepStatus, string> = {
  not_started: 'Not started',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  interrupted: 'Stopped when the app closed',
  needs_approval: 'Waiting for your approval',
  approved: 'Approved',
  sent_back: 'Sent back',
};
