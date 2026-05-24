import { evaluatePluginExecutionPolicy } from '../services/pluginSandboxService';

describe('plugin sandbox policy', () => {
  it('blocks args with shell control tokens', () => {
    const result = evaluatePluginExecutionPolicy({
      manifestPath: 'C:/plugins/sample/plugin.json',
      pluginId: 'sample.plugin',
      toolId: 'run',
      extraArgs: ['status', 'foo&&bar']
    });

    expect(result.allowed).toBe(false);
    expect(result.violations.join(' ')).toContain('blocked token');
  });

  it('allows bounded normal args', () => {
    const result = evaluatePluginExecutionPolicy({
      manifestPath: 'C:/plugins/sample/plugin.json',
      pluginId: 'sample.plugin',
      toolId: 'run',
      extraArgs: ['status', '--json']
    });

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });
});

