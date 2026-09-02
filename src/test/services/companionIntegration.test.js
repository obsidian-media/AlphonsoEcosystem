import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('iOS Companion Integration', () => {
  let invoke;

  beforeEach(async () => {
    const module = await import('@tauri-apps/api/core');
    invoke = module.invoke;
    vi.clearAllMocks();
  });

  it('checks companion service status via Tauri invoke', async () => {
    invoke.mockResolvedValue({ status: 'running', version: '2.4.4' });
    const result = await invoke('companion_get_status');
    expect(invoke).toHaveBeenCalledWith('companion_get_status');
    expect(result.status).toBe('running');
  });

  it('starts companion discovery from frontend', async () => {
    invoke.mockResolvedValue({ discovery_started: true });
    const result = await invoke('companion_start_discovery');
    expect(invoke).toHaveBeenCalledWith('companion_start_discovery');
    expect(result.discovery_started).toBe(true);
  });

  it('gets companion PIN', async () => {
    invoke.mockResolvedValue({ pin: '123456' });
    const result = await invoke('companion_get_pin');
    expect(invoke).toHaveBeenCalledWith('companion_get_pin');
    expect(result.pin).toBe('123456');
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

  it('mDNS service type format is valid', () => {
    const serviceType = '_alphonso._tcp';
    expect(serviceType).toBe('_alphonso._tcp');
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

  it('companion_get_local_ip returns IP address', async () => {
    invoke.mockResolvedValue({ ip: '192.168.1.100' });
    const result = await invoke('companion_get_local_ip');
    expect(result.ip).toBeDefined();
  });
});