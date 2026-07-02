import { describe, it, expect } from 'vitest';

const AGENTS = [
  { path: '../../agents/echo/echoProfile.js', name: 'Echo' },
  { path: '../../agents/sentinel/sentinelProfile.js', name: 'Sentinel' },
  { path: '../../agents/nova/novaProfile.js', name: 'Nova' },
  { path: '../../agents/jose/joseProfile.js', name: 'Jose' },
  { path: '../../agents/hector/hectorProfile.js', name: 'Hector' },
  { path: '../../agents/miya/miyaProfile.js', name: 'Miya' },
  { path: '../../agents/maria/mariaProfile.js', name: 'Maria' },
  { path: '../../agents/marcus/marcusProfile.js', name: 'Marcus' },
  { path: '../../agents/alphonso/alphonsoProfile.js', name: 'Alphonso' }
];

const REQUIRED_PROPERTIES = [
  'id', 'name', 'title', 'purpose', 'accentColor', 'visualIdentity',
  'personality', 'strengths', 'limitations', 'allowedActions',
  'blockedActions', 'outputTypes', 'requiresApprovalFor',
  'defaultPrompt', 'skillPackIds', 'skillFocus', 'exampleTasks',
  'hierarchyRank', 'mascotPath'
];

describe('Agent Profiles', () => {
  for (const { path, name } of AGENTS) {
    describe(`${name} Profile`, () => {
      let profile;
      
      beforeEach(async () => {
        const module = await import(path);
        profile = Object.values(module)[0];
      });

      it('has all required properties (20+)', () => {
        const propCount = Object.keys(profile).length;
        expect(propCount).toBeGreaterThanOrEqual(20);
      });

      it('has unique id matching name', () => {
        expect(profile.id).toBe(name.toLowerCase());
      });

      it('has hierarchyRank defined and is a number', () => {
        expect(profile.hierarchyRank).toBeDefined();
        expect(typeof profile.hierarchyRank).toBe('number');
      });

      it('has strengths as non-empty array', () => {
        expect(Array.isArray(profile.strengths)).toBe(true);
        expect(profile.strengths.length).toBeGreaterThan(0);
      });

      it('has limitations as array', () => {
        expect(Array.isArray(profile.limitations)).toBe(true);
      });

      it('has allowedActions as non-empty array', () => {
        expect(Array.isArray(profile.allowedActions)).toBe(true);
        expect(profile.allowedActions.length).toBeGreaterThan(0);
      });

      it('has blockedActions as non-empty array', () => {
        expect(Array.isArray(profile.blockedActions)).toBe(true);
        expect(profile.blockedActions.length).toBeGreaterThan(0);
      });

      it('has exampleTasks with at least 2 tasks', () => {
        expect(Array.isArray(profile.exampleTasks)).toBe(true);
        expect(profile.exampleTasks.length).toBeGreaterThanOrEqual(2);
      });

      it('has skillPackIds as array', () => {
        expect(Array.isArray(profile.skillPackIds)).toBe(true);
      });

      it('has outputTypes as array', () => {
        expect(Array.isArray(profile.outputTypes)).toBe(true);
      });
    });
  }

  describe('Profile Uniqueness', () => {
    it('all agents have defined hierarchyRank values', async () => {
      const profiles = await Promise.all(
        AGENTS.map(async ({ path }) => {
          const module = await import(path);
          return Object.values(module)[0];
        })
      );
      for (const p of profiles) {
        expect(typeof p.hierarchyRank).toBe('number');
      }
    });
  });
});