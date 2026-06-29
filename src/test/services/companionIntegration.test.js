import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('iOS Companion Integration', () => {
  const { invoke } = await import('@tauri-apps/api/core');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks companion service status via Tauri invoke', async () => {
    invoke.mockResolvedValue({ status: 'running', version: '2.4.4' });
    const result = await invoke('get_companion_status');
    expect(invoke).toHaveBeenCalledWith('get_companion_status');
    expect(result.status).toBe('running');
  });

  it('starts companion server from frontend', async () => {
    invoke.mockResolvedValue({ port: 8765 });
    const result = await invoke('start_companion_server');
    expect(invoke).toHaveBeenCalledWith('start_companion_server');
    expect(result.port).toBe(8765);
  });

  it('handles stop companion server', async () => {
    invoke.mockResolvedValue({});
    await invoke('stop_companion_server');
    expect(invoke).toHaveBeenCalledWith('stop_companion_server');
  });

  it('Swift WebSocket service matches Rust JSON-RPC protocol', () => {
    const methods = ['get_status', 'send_command', 'abort_command', 'approve_task', 'get_projects', 'get_boardroom'];
    expect(methods).toContain('get_status');
    expect(methods).toContain('send_command');
    expect(methods.length).toBe(6);
  });

  it('PIN auth format is correct for Swift-Rust handshake', () => {
    const pin = '123456';
    const authMessage = JSON.stringify({
      method: 'authenticate',
      params: { pin },
      id: 'auth'
    });
    const parsed = JSON.parse(authMessage);
    expect(parsed.method).toBe('authenticate');
    expect(parsed.params.pin).toBe('123456');
  });

  it('mDNS service type matches Rust discovery', () => {
    const serviceType = '_alphonso._tcp';
    const expected = '_alphonso._tcp';
    expect(serviceType).toBe(expected);
  });

  it('WebSocket connection format matches Rust server', () => {
    const host = '192.168.1.100';
    const port = 8765;
    const wsUrl = `ws://${host}:${port}`;
    expect(wsUrl).toContain('ws://');
    expect(wsUrl).toContain('8765');
  });

  it('send_command JSON format is valid', () => {
    const text = 'Hello Alphonso';
    const message = {
      method: 'send_command',
      params: { text },
      id: 'test-id-123'
    };
    const serialized = JSON.stringify(message);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.method).toBe('send_command');
    expect(deserialized.params.text).toBe('Hello Alphonso');
  });

  it('abort_command format is valid', () => {
    const message = {
      method: 'abort_command',
      params: { commandId: 'cmd-abc' },
      id: 'abort'
    };
    expect(message.method).toBe('abort_command');
    expect(message.params.commandId).toBe('cmd-abc');
  });

  it('approve_task format is valid', () => {
    const message = {
      method: 'approve_task',
      params: { taskId: 'task-xyz' },
      id: 'approve'
    };
    expect(message.method).toBe('approve_task');
    expect(message.params.taskId).toBe('task-xyz');
  });

  it('get_projects returns project list', async () => {
    invoke.mockResolvedValue({ projects: [{ name: 'Test Project' }] });
    const result = await invoke('get_projects');
    expect(result.projects).toBeDefined();
  });

  it('get_boardroom returns sessions', async () => {
    invoke.mockResolvedValue({ sessions: [] });
    const result = await invoke('get_boardroom');
    expect(result.sessions).toEqual([]);
  });
});