import { describe, it, expect } from 'vitest';
import { parseJsonResponse } from '../lib/jsonUtils';

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
