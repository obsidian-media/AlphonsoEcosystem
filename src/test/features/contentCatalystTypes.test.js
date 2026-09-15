import { describe, it, expect } from 'vitest';
import {
  CONTENT_JOB_STATES,
  CONTENT_STEPS,
  createDefaultContentNeeds,
  createDefaultContentRequest,
} from '../../features/content-catalyst/types/contentCatalystTypes';

describe('contentCatalystTypes', () => {
  describe('CONTENT_JOB_STATES', () => {
    it('has 17 states', () => {
      const keys = Object.keys(CONTENT_JOB_STATES);
      expect(keys).toHaveLength(17);
    });

    it('RECEIVED is received', () => {
      expect(CONTENT_JOB_STATES.RECEIVED).toBe('received');
    });

    it('QUEUED is queued', () => {
      expect(CONTENT_JOB_STATES.QUEUED).toBe('queued');
    });

    it('BRIEF_READY is brief_ready', () => {
      expect(CONTENT_JOB_STATES.BRIEF_READY).toBe('brief_ready');
    });

    it('BRIEFING is briefing', () => {
      expect(CONTENT_JOB_STATES.BRIEFING).toBe('briefing');
    });

    it('DRAFTING is drafting', () => {
      expect(CONTENT_JOB_STATES.DRAFTING).toBe('drafting');
    });

    it('IMAGE_REQUESTED is image_requested', () => {
      expect(CONTENT_JOB_STATES.IMAGE_REQUESTED).toBe('image_requested');
    });

    it('IMAGE_READY is image_ready', () => {
      expect(CONTENT_JOB_STATES.IMAGE_READY).toBe('image_ready');
    });

    it('VIDEO_REQUESTED is video_requested', () => {
      expect(CONTENT_JOB_STATES.VIDEO_REQUESTED).toBe('video_requested');
    });

    it('VIDEO_PROCESSING is video_processing', () => {
      expect(CONTENT_JOB_STATES.VIDEO_PROCESSING).toBe('video_processing');
    });

    it('VIDEO_READY is video_ready', () => {
      expect(CONTENT_JOB_STATES.VIDEO_READY).toBe('video_ready');
    });

    it('NARRATION_REQUESTED is narration_requested', () => {
      expect(CONTENT_JOB_STATES.NARRATION_REQUESTED).toBe('narration_requested');
    });

    it('NARRATION_READY is narration_ready', () => {
      expect(CONTENT_JOB_STATES.NARRATION_READY).toBe('narration_ready');
    });

    it('READY_FOR_REVIEW is ready_for_review', () => {
      expect(CONTENT_JOB_STATES.READY_FOR_REVIEW).toBe('ready_for_review');
    });

    it('WAITING_APPROVAL is waiting_approval', () => {
      expect(CONTENT_JOB_STATES.WAITING_APPROVAL).toBe('waiting_approval');
    });

    it('APPROVED_FOR_PUBLISH is approved_for_publish', () => {
      expect(CONTENT_JOB_STATES.APPROVED_FOR_PUBLISH).toBe('approved_for_publish');
    });

    it('PUBLISHED is published', () => {
      expect(CONTENT_JOB_STATES.PUBLISHED).toBe('published');
    });

    it('FAILED is failed', () => {
      expect(CONTENT_JOB_STATES.FAILED).toBe('failed');
    });

    it('all values are unique', () => {
      const values = Object.values(CONTENT_JOB_STATES);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe('CONTENT_STEPS', () => {
    it('has 7 steps', () => {
      expect(CONTENT_STEPS).toHaveLength(7);
    });

    it('starts with brief', () => {
      expect(CONTENT_STEPS[0]).toBe('brief');
    });

    it('ends with publish', () => {
      expect(CONTENT_STEPS[CONTENT_STEPS.length - 1]).toBe('publish');
    });

    it('includes all expected steps', () => {
      expect(CONTENT_STEPS).toEqual(['brief', 'draft', 'image', 'video', 'narration', 'preview', 'publish']);
    });
  });

  describe('createDefaultContentNeeds', () => {
    it('returns image: true by default', () => {
      expect(createDefaultContentNeeds().image).toBe(true);
    });

    it('returns video: false by default', () => {
      expect(createDefaultContentNeeds().video).toBe(false);
    });

    it('returns narration: false by default', () => {
      expect(createDefaultContentNeeds().narration).toBe(false);
    });

    it('returns publish: false by default', () => {
      expect(createDefaultContentNeeds().publish).toBe(false);
    });

    it('returns a new object each call', () => {
      expect(createDefaultContentNeeds()).not.toBe(createDefaultContentNeeds());
    });
  });

  describe('createDefaultContentRequest', () => {
    it('returns idea as empty string', () => {
      expect(createDefaultContentRequest().idea).toBe('');
    });

    it('returns platform as instagram', () => {
      expect(createDefaultContentRequest().platform).toBe('instagram');
    });

    it('returns format as post', () => {
      expect(createDefaultContentRequest().format).toBe('post');
    });

    it('returns tone as confident and polished', () => {
      expect(createDefaultContentRequest().tone).toBe('confident and polished');
    });

    it('includes needs object', () => {
      const request = createDefaultContentRequest();
      expect(request.needs).toBeDefined();
      expect(request.needs.image).toBe(true);
    });

    it('returns a new object each call', () => {
      expect(createDefaultContentRequest()).not.toBe(createDefaultContentRequest());
    });
  });
});
