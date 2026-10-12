import { describe, it, expect } from 'vitest';
import { parseJsonResponse, extractJsonObject } from '../lib/jsonUtils';

describe('parseJsonResponse', () => {
  it('parses plain JSON', () => {
    expect(parseJsonResponse('{"key":"value"}')).toEqual({ key: 'value' });
  });

  it('parses JSON wrapped in ```json fence', () => {
    const input = '```json\n{"a":1}\n```';
    expect(parseJsonResponse(input)).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in plain ``` fence', () => {
    const input = '```\n{"b":2}\n```';
    expect(parseJsonResponse(input)).toEqual({ b: 2 });
  });

  it('trims whitespace before parsing', () => {
    expect(parseJsonResponse('  {"x":true}  ')).toEqual({ x: true });
  });

  it('throws on malformed JSON', () => {
    expect(() => parseJsonResponse('not json')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => parseJsonResponse('')).toThrow();
  });

  it('coerces non-string input to string', () => {
    expect(() => parseJsonResponse(null)).toThrow();
  });
});

describe('extractJsonObject', () => {
  it('reads plain and fenced JSON objects', () => {
    expect(extractJsonObject('{"hook":"a"}')).toEqual({ hook: 'a' });
    expect(extractJsonObject('```json\n{"hook":"a"}\n```')).toEqual({ hook: 'a' });
  });

  it('reads an object with prose before and after it', () => {
    expect(extractJsonObject('Sure! Here is the package:\n{"hook":"a","scenes":[{"index":1}]}\nHope that helps.')).toEqual({
      hook: 'a',
      scenes: [{ index: 1 }],
    });
  });

  it('returns null when there is no JSON object', () => {
    for (const reply of ['', null, undefined, 'I cannot do that.', '[1,2,3]', '"just a string"', '{ not json }']) {
      expect(extractJsonObject(reply)).toBeNull();
    }
  });
});
