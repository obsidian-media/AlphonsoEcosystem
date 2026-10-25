// The routing set (agent phase 1, owner 2026-10-25): everyday requests and the
// agent and kind of work each part should get from Jose's rule plan, and which
// template fits. Today's misses are in it: "write a short post" became a video,
// "research … and write a summary" lost its writing part, a paragraph went to
// Alphonso as code.
import { describe, it, expect } from 'vitest';
import { decomposeJoseCommand, parseJoseCommand } from '../../../services/joseCommandRouterService';
import { scoreTemplateFit, TEMPLATE_FIT_THRESHOLD, asksToMake } from '../../../services/jose/joseTemplates';
import { NEEDS_OUTPUT_FOLDER } from '../../../services/contentFactory/contentFromChat';

type Part = [agent: string, actionType: string];

const RULE_PLAN: [string, Part[]][] = [
  ['What is the capital of France?', [['alphonso', 'assistant_answer']]],
  ['Tell me a joke', [['alphonso', 'assistant_answer']]],
  ['write a short post about honeybees', [['alphonso', 'assistant_write']]],
  ['Write a paragraph about the history of tea', [['alphonso', 'assistant_write']]],
  ['Draft an email to my landlord about the broken heating', [['alphonso', 'assistant_write']]],
  ['Write a letter to my bank asking to close my account', [['alphonso', 'assistant_write']]],
  ['Summarise the main points of remote work', [['alphonso', 'assistant_write']]],
  ['Write a short post about our new app', [['alphonso', 'assistant_write']]],
  ['Research how many honeybee colonies there are in Europe and write a short summary of the causes', [['hector', 'research'], ['alphonso', 'assistant_write']]],
  ['Research three facts about honeybees, write a short post about them, and have the post checked for accuracy', [['hector', 'research'], ['alphonso', 'assistant_write'], ['maria', 'audit_quality']]],
  ['Write a blog post about honeybees and check it for accuracy', [['alphonso', 'assistant_write'], ['maria', 'audit_quality']]],
  ['/jose Research three facts about honeybees and write a brief paragraph from them. Do not send it anywhere.', [['hector', 'research'], ['alphonso', 'assistant_write']]],
  ['Research the latest pricing for Ollama hosting', [['hector', 'research']]],
  ['Find sources about the 2026 EU AI Act', [['hector', 'research']]],
  ['Research competitors in the coffee market and score the opportunity', [['hector', 'research'], ['nova', 'opportunity_analysis']]],
  ['Fix the failing test in my app', [['alphonso', 'local_operation']]],
  ['Build the project and run the tests', [['alphonso', 'local_operation']]],
  ['Install the dependencies for my repo', [['alphonso', 'local_operation']]],
  ['Write a function that sorts a list', [['alphonso', 'local_operation']]],
  ['Refactor the login code', [['alphonso', 'local_operation']]],
  ['Design a thumbnail for my channel', [['miya', 'creative_package']]],
  ['Write a script for a 30 second ad', [['miya', 'creative_package']]],
  ['Publish this post to Instagram', [['marcus', 'distribution_readiness']]],
  ['Send the summary to Slack', [['marcus', 'distribution_readiness']]],
  ['Scan my last week for security issues', [['sentinel', 'security_monitor']]],
  ['Which of these ideas should we prioritize?', [['nova', 'opportunity_analysis']]],
  ['Remember that the launch is on Friday', [['echo', 'memory_preservation']]],
  ['Audit this plan for compliance risks', [['maria', 'governance_audit']]],
];

const TEMPLATES: [string, string | null][] = [
  ['Make three Shorts for our launch', 'content_video'],
  ['Make a YouTube short about our launch', 'content_video'],
  ['Make a YouTube video script about our launch', 'content_video'],
  ['Build a web app with a login page', 'build_app'],
  ['Write a research report on solar panels', 'research_report'],
  ['write a short post about honeybees', null],
  ['Write a short post about our new app', null],
  ['Research three facts about honeybees, write a short post about them, and have the post checked for accuracy', null],
  ['Write a paragraph about the history of tea', null],
  ['Draft an email to my landlord about the broken heating', null],
];

const partsOf = (text: string): Part[] => decomposeJoseCommand(parseJoseCommand(text)).map((a) => [a.agent, a.actionType] as Part);
const sorted = (parts: Part[]) => parts.map((p) => p.join(':')).sort();

describe('the routing set: the rule plan gives each part to its owner', () => {
  for (const [text, expected] of RULE_PLAN) {
    it(text, () => expect(sorted(partsOf(text))).toEqual(sorted(expected)));
  }

  it('a writing step reads the research, and the check reviews the writing', () => {
    const steps = decomposeJoseCommand(parseJoseCommand('Research three facts about honeybees, write a short post about them, and have the post checked for accuracy'));
    const write = steps.find((s) => s.actionType === 'assistant_write')!;
    const check = steps.find((s) => s.actionType === 'audit_quality')!;
    expect(write.needs).toEqual(['hector']);
    expect(check.reviewOf).toBe(write.stepId);
    expect(check.needs).toEqual([write.stepId]);
  });
});

describe('the routing set: which template fits', () => {
  for (const [text, template] of TEMPLATES) {
    it(`${text} → ${template ?? 'none'}`, () => {
      const best = scoreTemplateFit(text)[0];
      const fits = best && best.score >= TEMPLATE_FIT_THRESHOLD ? best.templateId : null;
      expect(fits).toBe(template);
    });
  }
});

describe('Nova runs after Hector (agent phase 2)', () => {
  it('research then judging: Nova waits for Hector', () => {
    const steps = decomposeJoseCommand(parseJoseCommand('Research the coffee subscription market in Canada and tell me which opportunity is worth going after first'));
    const nova = steps.find((s) => s.agent === 'nova');
    expect(nova?.actionType).toBe('opportunity_analysis');
    expect(nova?.needs).toEqual(['hector']);
  });
});

describe('the video shortcut needs a request to make something (agent phase 2)', () => {
  const shortcut = (text: string) => {
    const best = scoreTemplateFit(text)[0];
    return best?.templateId === 'content_video' && best.score >= TEMPLATE_FIT_THRESHOLD && asksToMake(text);
  };
  for (const text of ['Make a YouTube video script about our launch', 'Make three Shorts for our launch', 'Make a promo video comparing a newsletter and a podcast']) {
    it(`takes the shortcut: ${text}`, () => expect(shortcut(text)).toBe(true));
  }
  for (const text of [
    'Which of these should a small bakery do first: a weekly email newsletter, a YouTube channel, or a podcast? Prioritize them.',
    'Should we start a YouTube channel or a podcast?',
    'How many YouTube channel posts a week is too many?',
  ]) {
    it(`does not take it: ${text}`, () => expect(shortcut(text)).toBe(false));
  }
  it('the bakery question goes to Nova', () => {
    expect(sorted(partsOf('Which of these should a small bakery do first: a weekly email newsletter, a YouTube channel, or a podcast? Prioritize them.'))).toEqual(['nova:opportunity_analysis']);
  });
  it('the reply says what Jose understood', () => {
    expect(NEEDS_OUTPUT_FOLDER).toBe('I took this as a content video for Miya Studio. Choose an output folder in Settings → Runtime → Local Services first, then ask again, or say "plan this fresh" to have it planned normally.');
  });
});

describe('publishing needs a send word; turning into counts as making (agent phase 2)', () => {
  it('post this to Instagram is publishing', () => expect(sorted(partsOf('Post this to Instagram'))).toContain('marcus:distribution_readiness'));
  it('turn … into is a request to make something', () => {
    expect(asksToMake('Turn my blog post into a YouTube video script')).toBe(true);
    expect(asksToMake('What is a good return on a YouTube channel?')).toBe(false);
  });
});
