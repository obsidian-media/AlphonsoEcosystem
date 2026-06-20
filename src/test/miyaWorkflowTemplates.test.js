import { describe, expect, it } from 'vitest';
import { MIYA_WORKFLOW_TEMPLATES, getMiyaWorkflowTemplate, listMiyaWorkflowTemplates } from '../services/miyaWorkflowTemplates';

describe('miya workflow templates', () => {
  it('exports the three starter template packs', () => {
    expect(MIYA_WORKFLOW_TEMPLATES).toHaveLength(3);
    expect(listMiyaWorkflowTemplates().map((template) => template.name)).toEqual([
      'text-to-image',
      'img-to-img',
      'video-from-image'
    ]);
  });

  it('returns a template by name with required inputs and workflow JSON', () => {
    const template = getMiyaWorkflowTemplate('video-from-image');

    expect(template).toBeTruthy();
    expect(template.required_inputs).toContain('input_image');
    expect(template.workflow_json_template['1'].class_type).toBe('LoadImage');
  });
});
