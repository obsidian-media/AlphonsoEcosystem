// Hand-overs (agent phase 3, owner 2026-10-25): every agent gets all the work it is linked
// to. Alphonso's writing used to see only the request (Hector's research only through a
// tool, first step only), and Miya read "Hector's latest step" instead of her links.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { assistantPrompt, miyaResearchSnippet } from '../../../services/joseExecutionEngineService';


const need = (stepId, agent, text, sources = []) => ({ stepId, agent, text, files: [], sources, cut: 0, main: '' });
const input = (needs) => ({ instruction: 'Write a short summary.', request: 'Research coffee and write a summary', needs, others: [], memory: '', review: null });

describe('hand-overs', () => {
  it("Alphonso's writing prompt has every linked step", () => {
    const prompt = assistantPrompt('Write a short summary', input([need('hector', 'hector', 'Bees beat their wings 11,400 times a minute [1].'), need('nova', 'nova', 'What to do first: the newsletter.')]));
    expect(prompt).toContain('11,400 times a minute');
    expect(prompt).toContain('What to do first: the newsletter.');
  });

  // QA, 2026-10-31 (7B desktop run): a writing step sent back by a review never saw "Fix what the
  // review found", so Alphonso rewrote "[Your Name]" into the note twice and Marcus sent nothing.
  it("Alphonso's writing prompt has his step's instruction, including what a review asked to fix", () => {
    const fix = { ...input([need('write', 'alphonso', 'The shop opens at 9. [Your Name]')]), instruction: ['Write a one-line note.', '', 'Fix what the review found:', '- Fill in [Your Name] before it is sent: use the request, or write it without that part.'].join('\n') };
    const prompt = assistantPrompt('Write a one-line note that the shop opens at 9 and send it to n8n.', fix);
    expect(prompt).toContain('Fix what the review found:');
    expect(prompt).toContain('Fill in [Your Name] before it is sent');
    // The request is still there, and the instruction comes before it.
    expect(prompt.indexOf('Fix what the review found:')).toBeLessThan(prompt.indexOf('Request: Write a one-line note'));
  });

  it("Alphonso's step uses the step model", () => {
    const engine = readFileSync('src/services/joseExecutionEngineService.ts', 'utf8');
    const body = engine.slice(engine.indexOf('async function executeAssistantAssignment'), engine.indexOf('async function executeAssistantAssignment') + 1500);
    expect(body).not.toMatch(/model:\s*options\.model\s*\|\|\s*getConfiguredOllamaModel/);
    expect(body).not.toMatch(/endpoint:\s*options\.endpoint/);
  });

  it("Miya's package reads the steps she is linked to", () => {
    const snippet = miyaResearchSnippet(input([need('hector', 'hector', 'Linked research', ['https://a.example']), need('nova', 'nova', 'What to do first: angle B.')]), { hector: { summary: 'A later, unrelated Hector step' } });
    expect(snippet).toContain('Linked research');
    expect(snippet).toContain('What to do first: angle B.');
    expect(snippet).toContain('https://a.example');
    expect(snippet).not.toContain('unrelated');
  });

  it("without a step input Miya still reads Hector's output", () => {
    expect(miyaResearchSnippet(null, { hector: { summary: 'Old path research', sources: ['https://b.example'] } })).toContain('Old path research');
  });
});
