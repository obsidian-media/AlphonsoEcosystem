import { getStorage, setStorage } from '../lib/appStorage';

describe('appStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getStorage', () => {
    it('returns fallback when key is absent', () => {
      expect(getStorage('missing_key', 'default')).toBe('default');
    });

    it('returns fallback when key is absent and fallback is array', () => {
      expect(getStorage('missing_key', [])).toEqual([]);
    });

    it('returns parsed value when key exists', () => {
      localStorage.setItem('test_key', JSON.stringify({ foo: 'bar' }));
      expect(getStorage('test_key', null)).toEqual({ foo: 'bar' });
    });

    it('returns fallback on invalid JSON', () => {
      localStorage.setItem('bad_key', '{not valid json}');
      expect(getStorage('bad_key', 'fallback')).toBe('fallback');
    });

    it('returns primitive values correctly', () => {
      localStorage.setItem('num_key', JSON.stringify(42));
      expect(getStorage('num_key', 0)).toBe(42);
    });
  });

  describe('setStorage', () => {
    it('stores a string value retrievable by getStorage', () => {
      setStorage('str_key', 'hello');
      expect(getStorage('str_key', null)).toBe('hello');
    });

    it('stores an object value retrievable by getStorage', () => {
      const data = { agent: 'jose', count: 3 };
      setStorage('obj_key', data);
      expect(getStorage('obj_key', null)).toEqual(data);
    });

    it('stores an array value retrievable by getStorage', () => {
      setStorage('arr_key', [1, 2, 3]);
      expect(getStorage('arr_key', [])).toEqual([1, 2, 3]);
    });

    it('overwrites an existing value', () => {
      setStorage('ow_key', 'first');
      setStorage('ow_key', 'second');
      expect(getStorage('ow_key', null)).toBe('second');
    });
  });
});
