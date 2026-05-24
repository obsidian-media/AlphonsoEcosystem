export const CONTENT_JOB_STATES = {
  RECEIVED: 'received',
  QUEUED: 'queued',
  BRIEF_READY: 'brief_ready',
  BRIEFING: 'briefing',
  DRAFTING: 'drafting',
  IMAGE_REQUESTED: 'image_requested',
  IMAGE_READY: 'image_ready',
  VIDEO_REQUESTED: 'video_requested',
  VIDEO_PROCESSING: 'video_processing',
  VIDEO_READY: 'video_ready',
  NARRATION_REQUESTED: 'narration_requested',
  NARRATION_READY: 'narration_ready',
  READY_FOR_REVIEW: 'ready_for_review',
  WAITING_APPROVAL: 'waiting_approval',
  APPROVED_FOR_PUBLISH: 'approved_for_publish',
  PUBLISHED: 'published',
  FAILED: 'failed'
};

export const CONTENT_STEPS = [
  'brief',
  'draft',
  'image',
  'video',
  'narration',
  'preview',
  'publish'
];

export function createDefaultContentNeeds() {
  return {
    image: true,
    video: false,
    narration: false,
    publish: false
  };
}

export function createDefaultContentRequest() {
  return {
    idea: '',
    business_context: '',
    platform: 'instagram',
    format: 'post',
    tone: 'confident and polished',
    needs: createDefaultContentNeeds()
  };
}
