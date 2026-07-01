import { describe, it, expect } from 'vitest';
import { MIYA_WORKFLOW_TEMPLATES, listMiyaWorkflowTemplates, getMiyaWorkflowTemplate } from '../../services/miyaWorkflowTemplates';

describe('miyaWorkflowTemplates', () => {
  it('exports 3 templates', () => {
    expect(MIYA_WORKFLOW_TEMPLATES.length).toBe(3);
  });

  it('each template has required fields', () => {
    MIYA_WORKFLOW_TEMPLATES.forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(Array.isArray(t.required_inputs)).toBe(true);
      expect(t.workflow_json_template).toBeTruthy();
    });
  });

  describe('listMiyaWorkflowTemplates', () => {
    it('returns deep clones', () => {
      const list = listMiyaWorkflowTemplates();
      expect(list.length).toBe(3);
      // Modifying clone shouldn't affect original
      list[0].name = 'modified';
      expect(MIYA_WORKFLOW_TEMPLATES[0].name).toBe('text-to-image');
    });
  });

  describe('getMiyaWorkflowTemplate', () => {
    it('returns template by name', () => {
      const t = getMiyaWorkflowTemplate('text-to-image');
      expect(t).toBeTruthy();
      expect(t.name).toBe('text-to-image');
    });

    it('returns null for unknown name', () => {
      expect(getMiyaWorkflowTemplate('nonexistent')).toBeNull();
    });
  });
});
