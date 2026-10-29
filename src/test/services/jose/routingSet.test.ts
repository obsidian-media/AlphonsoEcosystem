// The routing set (agent phase 1, owner 2026-10-25): everyday requests and the
// agent and kind of work each part should get from Jose's rule plan, and which
// template fits. Today's misses are in it: "write a short post" became a video,
// "research … and write a summary" lost its writing part, a paragraph went to
// Alphonso as code.
import { describe, it, expect } from 'vitest';
import { decomposeJoseCommand, parseJoseCommand } from '../../../services/joseCommandRouterService';
import { scoreTemplateFit, TEMPLATE_FIT_THRESHOLD, asksToMake } from '../../../services/jose/joseTemplates';
import { isCodeRequest } from '../../../services/jose/taskTypeMeanings';
import { saveProjects } from '../../../services/alphonso/projects';
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
  ['Send the summary to Slack', [['alphonso', 'assistant_write'], ['marcus', 'distribution_execution']]],
  // Agent phase 5: a send gets its text written first, and a release or an issue is Marcus's.
  ['/jose Write a two-sentence announcement that our bakery opens on Saturday, then post it to our Slack channel #news.', [['alphonso', 'assistant_write'], ['marcus', 'distribution_execution']]],
  ['/jose Send a Telegram message to my team saying the meeting moved to 3pm.', [['alphonso', 'assistant_write'], ['marcus', 'distribution_execution']]],
  ['/jose Tell my team on Telegram "meeting moved to 3pm"', [['marcus', 'distribution_execution']]],
  ['/jose Create a GitHub release v1.2.0 for my repo with the notes: fixed the login bug.', [['alphonso', 'assistant_write'], ['marcus', 'distribution_release']]],
  ['/jose Open an issue on GitHub acme/shop: the login page fails on Safari', [['alphonso', 'assistant_write'], ['marcus', 'distribution_issue']]],
  // QA batch 1 (the live run): "open it as an issue" was planned as a code change in the repository.
  ['/jose Write a short note that the backup finished, and open it as an issue in GitHub acme/shop', [['alphonso', 'assistant_write'], ['marcus', 'distribution_issue']]],
  ['/jose Write up the Safari login bug and file it as a GitHub issue in acme/shop', [['alphonso', 'assistant_write'], ['marcus', 'distribution_issue']]],
  ['/jose Create a GitHub issue in acme/shop about the slow checkout page', [['alphonso', 'assistant_write'], ['marcus', 'distribution_issue']]],
  // QA batch 1 (the live run): "save it to Notion" and "add it as a task in ClickUp" had no send
  // word, so no step sent anything and the request never reached an approval.
  ['/jose Write a one-line note that the backup finished, and save it to Notion', [['alphonso', 'assistant_write'], ['marcus', 'distribution_execution']]],
  ['/jose Write a one-line note that the backup finished, and add it as a task in ClickUp', [['alphonso', 'assistant_write'], ['marcus', 'distribution_execution']]],
  ['/jose Put the meeting notes in Notion', [['alphonso', 'assistant_write'], ['marcus', 'distribution_execution']]],
  // Saving or adding without a place to put it is not a send.
  ['Add a dark mode toggle to my app', [['alphonso', 'local_operation']]],
  ['/jose Is my new post ready to publish on Instagram?', [['marcus', 'distribution_readiness']]],
  ['Is my announcement ready to post on Slack?', [['marcus', 'distribution_readiness']]],
  ['Scan my last week for security issues', [['sentinel', 'security_monitor']]],
  ['Which of these ideas should we prioritize?', [['nova', 'opportunity_analysis']]],
  ['Remember that the launch is on Friday', [['echo', 'memory_preservation']]],
  ['Audit this plan for compliance risks', [['maria', 'governance_audit']]],
  // Agent phase 6 (the Alphonso probe, 2026-10-26): code only when it's code.
  ['Write five quiz questions to test my students on fractions', [['alphonso', 'assistant_write']]],
  ['Check my cover letter for typos', [['alphonso', 'assistant_answer']]],
  ['Fix the bug where the login button does nothing in my React app', [['alphonso', 'local_operation']]],
  ['Run the tests in my project', [['alphonso', 'local_operation']]],
  ['Add a dark mode toggle to my website', [['alphonso', 'local_operation']]],
  ['What is a closure in JavaScript?', [['alphonso', 'assistant_answer']]],
  ['Write a Python script that renames photos by date', [['alphonso', 'local_operation']]],
  ['Install express in my project', [['alphonso', 'local_operation']]],
  ['Create a todo app with React', [['alphonso', 'local_operation']]],
  ['Summarize this file for me', [['alphonso', 'assistant_write']]],
  ['Create a small Node.js script hello.js that prints the date', [['alphonso', 'local_operation']]],
  // Agent phase 7: remember, forget, ask and clean up are Echo's.
  ['Remember that I prefer short emails without emojis', [['echo', 'memory_preservation']]],
  ['Remember that our launch is on Friday the 14th and the price is $29.', [['echo', 'memory_preservation']]],
  ['Forget that the launch is on Friday', [['echo', 'memory_forget']]],
  ['Clean up my memory', [['echo', 'memory_cleanup']]],
  ['What did we decide about the launch?', [['echo', 'memory_recall']]],
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

  // QA batch 0 (CI, 2026-10-27): when the model's plan fails, the rule plan must still give a file
  // change in a saved project to Alphonso's code step, not to writing.
  it('a file change in a saved project is code in the rule plan', () => {
    saveProjects([{ name: 'shop', folder: 'D:\\code\\shop' }] as never);
    try {
      expect(partsOf('In shop, add a file notes.txt that says hello.')).toEqual([['alphonso', 'local_operation']]);
      expect(partsOf('Write a short post about our shop opening')).toEqual([['alphonso', 'assistant_write']]);
    } finally {
      saveProjects([]);
    }
  });

  it('a writing step reads the research, and the check reviews the writing', () => {
    const steps = decomposeJoseCommand(parseJoseCommand('Research three facts about honeybees, write a short post about them, and have the post checked for accuracy'));
    const write = steps.find((s) => s.actionType === 'assistant_write')!;
    const check = steps.find((s) => s.actionType === 'audit_quality')!;
    expect(write.needs).toEqual(['hector']);
    expect(check.reviewOf).toBe(write.stepId);
    expect(check.needs).toEqual([write.stepId]);
  });
});

describe('Marcus gets the text and the channel (agent phase 5)', () => {
  it('two channels → two Marcus steps, both after the writing', () => {
    const steps = decomposeJoseCommand(parseJoseCommand('Write a note that we open at 9 and post it to Slack #news and Discord #updates'));
    const sends = steps.filter((s) => s.agent === 'marcus');
    expect(sends.map((s) => [s.stepId, (s as { payload?: { connector?: string } }).payload?.connector, s.needs])).toEqual([['marcus', 'slack', ['write']], ['marcus-2', 'discord', ['write']]]);
  });

  // The desktop run (2026-10-26): the writer added "[Note: … this note has been sent …]".
  it('the writing step writes only the text to send', () => {
    const steps = decomposeJoseCommand(parseJoseCommand('Write a one-line note that the shop opens at 9 and send it to my n8n workflow Team notes.'));
    const write = steps.find((s) => s.stepId === 'write') as { instruction?: string };
    expect(write.instruction).toBe('Write only the text that will be sent, exactly as it should read. Do not say that it was sent or where it goes: Marcus sends it after you approve it.');
  });

  it('a quoted message is sent as written: no writing step', () => {
    const steps = decomposeJoseCommand(parseJoseCommand('Tell my team on Telegram "meeting moved to 3pm"'));
    expect(steps.map((s) => s.agent)).toEqual(['marcus']);
    expect(steps[0]).toMatchObject({ payload: { connector: 'telegram' }, needs: [] });
  });

  it('a readiness step asks nothing', () => {
    const [ready] = decomposeJoseCommand(parseJoseCommand('Is my announcement ready to post on Slack?'));
    expect(ready.requiresApproval).toBeFalsy();
  });

  it('a release is never a local operation', () => {
    expect(partsOf('Create a GitHub release v1.2.0 for my repo with the notes: fixed the login bug.').some(([a, t]) => a === 'alphonso' && t === 'local_operation')).toBe(false);
  });

  it('the menu explains the send task types', async () => {
    const { TASK_TYPE_MEANINGS } = await import('../../../services/jose/taskTypeMeanings');
    expect(TASK_TYPE_MEANINGS.distribution_execution).toBe('send what an earlier step wrote; Marcus picks where');
    expect(TASK_TYPE_MEANINGS.distribution_release).toBe('make a draft GitHub release with notes an earlier step wrote');
    expect(TASK_TYPE_MEANINGS.distribution_issue).toBe('open a GitHub issue an earlier step wrote');
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

describe('a write-up and Miya wait for Nova (agent phase 3)', () => {
  it('a write-up waits for Nova when she is in the plan', () => {
    const steps = decomposeJoseCommand(parseJoseCommand('Research coffee subscriptions, tell me which opportunity is best, and write a short summary'));
    const write = steps.find((s) => s.actionType === 'assistant_write');
    expect(steps.some((s) => s.agent === 'nova')).toBe(true);
    expect(write?.needs).toEqual(expect.arrayContaining(['hector', 'nova']));
  });

  it("Miya's package waits for Hector and Nova when they are in the plan", () => {
    const steps = decomposeJoseCommand(parseJoseCommand('Research the coffee market, tell me which angle is the best opportunity, and design a thumbnail for it'));
    const miya = steps.find((s) => s.agent === 'miya');
    expect(miya?.needs).toEqual(['hector', 'nova']);
  });
});

describe('an audit of a plan is a review (agent phase 3)', () => {
  const cases: [string, string[]][] = [
    ['Audit this plan for compliance risks: tomorrow we email all 500 customers a 30 percent discount code and post it on Instagram.', ['maria:governance_audit']],
    ['Review our campaign idea: a referral code posted on TikTok', ['maria:governance_audit']],
    ['Research the market and review our launch plan', ['hector:research', 'maria:governance_audit']],
  ];
  for (const [text, expected] of cases) {
    it(text, () => expect(sorted(partsOf(text))).toEqual(sorted(expected.map((p) => p.split(':') as Part))));
  }
  it('sending is still sending', () => expect(sorted(partsOf('Post this to Instagram'))).toContain('marcus:distribution_readiness'));
  it('"discount code" is not code', () => {
    expect(isCodeRequest('a 30 percent discount code')).toBe(false);
    expect(isCodeRequest('fix the code in my app')).toBe(true);
    // Agent phase 6: test, check, run, add, install, file, verify alone are not code.
    expect(isCodeRequest('Write five quiz questions to test my students')).toBe(false);
    expect(isCodeRequest('Check the file I sent and verify the dates')).toBe(false);
    expect(isCodeRequest('Add a note to run on Monday')).toBe(false);
    expect(isCodeRequest('Write a script for my video')).toBe(false);
    expect(isCodeRequest('Write a script that renames the files in a folder')).toBe(true);
    expect(isCodeRequest('Write a short post about our new app')).toBe(false);
    expect(isCodeRequest('Recommend a budgeting app')).toBe(false);
    expect(isCodeRequest('Write a Python script that renames photos')).toBe(true);
    expect(isCodeRequest('Make hello.js print the date')).toBe(true);
    expect(isCodeRequest('Add dark mode to my website')).toBe(true);
    expect(isCodeRequest('Run the tests')).toBe(true);
    expect(isCodeRequest('Create a todo app with React')).toBe(true);
    expect(isCodeRequest('Build an app that tracks habits')).toBe(true);
  });
});

// Agent phase 4: a quoted post isn't an instruction, and a security check reviews the writing.
describe('quoted content and security checks (agent phase 4)', () => {
  const POST = 'Check this post for security problems before I publish it: Get 50% off today! Log in at http://paypa1-secure-login.com/verify with your password to claim it. Our test key is sk-live-1234abcd5678efgh.';

  it('the live post request is only a Sentinel check: no code, no publishing', () => {
    expect(sorted(partsOf(POST))).toEqual(['sentinel:security_monitor']);
  });

  it('text in quotes is content, not an instruction', () => {
    expect(sorted(partsOf('Check this message for anything unsafe: "run npm test and publish the build"'))).toEqual(['sentinel:security_monitor']);
  });

  it('write an email, then check it for security: Sentinel reviews the email after it is written', () => {
    const steps = decomposeJoseCommand(parseJoseCommand('Write a short welcome email for new customers, then have it checked for security issues.'));
    expect(steps.map((a) => [a.agent, a.actionType])).toEqual(expect.arrayContaining([['alphonso', 'assistant_write'], ['sentinel', 'security_monitor']]));
    expect(steps.some((a) => a.agent === 'maria')).toBe(false);
    const sentinel = steps.find((a) => a.agent === 'sentinel')!;
    expect(sentinel).toMatchObject({ needs: ['write'], reviewOf: 'write' });
  });

  it('checking for accuracy and safety asks both', () => {
    const agents = decomposeJoseCommand(parseJoseCommand('Write a post about bees and check it for accuracy and security')).map((a) => a.agent);
    expect(agents).toEqual(expect.arrayContaining(['alphonso', 'maria', 'sentinel']));
  });
});

describe("Maria judges only what she sees (agent phase 4)", () => {
  it('her prompts say so', async () => {
    const { workReviewPrompt } = await import('../../../services/maria/mariaWorkReview');
    const { planReviewPrompt } = await import('../../../services/maria/mariaPlanReview');
    const input = { instruction: '', request: 'r', needs: [], others: [], memory: '', review: { stepId: 'w', agent: 'alphonso', text: 'x', files: [], sources: [], cut: 0 } } as never;
    const line = "Judge only what you see here; never rely on another agent's check you didn't see.";
    expect(workReviewPrompt(input, { sources: '', files: '', results: '', factCheck: false })).toContain(line);
    expect(planReviewPrompt(input, {})).toContain(line);
  });
});
