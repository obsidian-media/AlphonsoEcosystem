// Hector reads the parts of a page that match the question (agent phase 1).
import { describe, it, expect } from 'vitest';
import { relevantText, pageBudget, questionTerms } from '../../../services/hector/relevantText';

const PAGE = [
  'Home | About | Contact | Shop | Login',
  'Accept cookies',
  'Skip to content',
  'The weather in Paris was mild this spring, with some rain in April.',
  'Europe has about 17 million managed honeybee colonies, according to the European Commission.',
  'Subscribe to our newsletter',
  'Colony losses over winter were linked to the varroa mite, pesticides and the loss of flowering land.',
  'Share on Facebook Share on X',
].join('\n');

describe('relevantText', () => {
  const terms = questionTerms('How many honeybee colonies are in Europe and why are colonies declining?');

  it('drops menus, cookie lines and share buttons', () => {
    const text = relevantText(PAGE, terms, 2000);
    expect(text).not.toMatch(/Accept cookies|Skip to content|Share on|Subscribe|Login/);
  });

  it('keeps the paragraphs about the question, in page order', () => {
    const text = relevantText(PAGE, terms, 2000);
    expect(text.indexOf('17 million')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('varroa')).toBeGreaterThan(text.indexOf('17 million'));
  });

  it('keeps the best paragraphs first when the budget is small', () => {
    const text = relevantText(PAGE, terms, 120);
    expect(text).toContain('17 million');
    expect(text).not.toContain('weather in Paris');
    expect(text.length).toBeLessThanOrEqual(120);
  });

  it('an empty page gives nothing', () => {
    expect(relevantText('', terms, 1000)).toBe('');
  });
});

describe('pageBudget', () => {
  it('shares the total between the sources, larger for large models', () => {
    expect(pageBudget(8, false)).toBe(1000);
    expect(pageBudget(8, true)).toBe(3000);
    expect(pageBudget(0, false)).toBe(8000);
  });
});

describe('questionTerms', () => {
  it('keeps the words that matter', () => {
    expect(questionTerms('How many honeybee colonies are there in Europe?')).toEqual(['honeybee', 'colonies', 'europe']);
  });
});
