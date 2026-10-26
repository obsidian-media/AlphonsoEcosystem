// Agent phase 6: reading Alphonso's one JSON answer for a code step.
import { describe, it, expect } from 'vitest';
import { parseCodeAnswer, isAlphonsoCodeStep } from '../../../services/alphonso/codeStep';

describe('codeStep', () => {
  // Live run (2026-10-26): a 7B model wrote "npm test" as one program, "None" as a command, and
  // had to invent a file change for "Run the tests" because commands alone weren't an answer.
  it('reads commands in the shape small models write them, and commands alone are an answer', () => {
    const a = parseCodeAnswer(JSON.stringify({ title: 't', plan: 'p', commands: [
      { program: 'npm test', args: [], why: 'run the tests' },
      { program: 'npm run lint', args: ['--fix'] },
      { program: 'None', args: [] },
      { program: '  ', args: [] },
    ] }));
    expect(a?.files).toEqual([]);
    expect(a?.commands).toEqual([
      { program: 'npm', args: ['test'], why: 'run the tests' },
      { program: 'npm', args: ['run', 'lint', '--fix'], why: '' },
    ]);
    expect(parseCodeAnswer(JSON.stringify({ commands: [{ program: 'none' }] }))).toBeNull();
  });

  it('reads a fenced answer', () => {
    const raw = '```json\n{"title":"Hello","plan":"Print the date.","files":[{"path":"hello.js","content":"console.log(new Date())"}],"commands":[{"program":"node","args":["hello.js"],"why":"run it"}]}\n```';
    expect(parseCodeAnswer(raw)).toEqual({
      title: 'Hello', plan: 'Print the date.', files: [{ path: 'hello.js', content: 'console.log(new Date())' }],
      commands: [{ program: 'node', args: ['hello.js'], why: 'run it' }], questions: [], read: [],
    });
  });

  it('needs files or questions', () => {
    expect(parseCodeAnswer('{"title":"x","plan":"y","files":[]}')).toBeNull();
    expect(parseCodeAnswer('{"questions":["Which framework?"]}')).toMatchObject({ questions: ['Which framework?'], files: [] });
    expect(parseCodeAnswer('{"read":["src/a.ts"]}')).toMatchObject({ read: ['src/a.ts'], files: [] });
    expect(parseCodeAnswer('no')).toBeNull();
  });

  it('keeps only strings in read and args', () => {
    expect(parseCodeAnswer('{"read":["a.js",3],"files":[{"path":"b.js","content":"x"}],"commands":[{"program":"npm","args":["run",1]}]}'))
      .toMatchObject({ read: ['a.js'], commands: [{ program: 'npm', args: ['run'], why: '' }] });
  });

  it('a code step is an Alphonso code task', () => {
    expect(isAlphonsoCodeStep({ agent: 'alphonso', actionType: 'local_operation' })).toBe(true);
    expect(isAlphonsoCodeStep({ agent: 'alphonso', actionType: 'verification_workflow_step' })).toBe(true);
    expect(isAlphonsoCodeStep({ agent: 'alphonso', actionType: 'assistant_write' })).toBe(false);
    expect(isAlphonsoCodeStep({ agent: 'miya', actionType: 'local_operation' })).toBe(false);
    // A content-factory step runs through the factory's own executor.
    expect(isAlphonsoCodeStep({ agent: 'alphonso', actionType: 'local_operation', contentStep: { projectId: 'p', step: 'assemble' } } as never)).toBe(false);
  });
});
