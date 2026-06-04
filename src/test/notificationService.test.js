import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => invoke(...args)
}));

const { sendNativeNotification } = await import('../services/notificationService.js');

describe('notificationService', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
  });

  describe('sendNativeNotification', () => {
    it('calls invoke with title and body', async () => {
      await sendNativeNotification('Hello', 'World');
      expect(invoke).toHaveBeenCalledWith('send_app_notification', { title: 'Hello', body: 'World' });
    });

    it('converts title to string', async () => {
      await sendNativeNotification(123, 'Body');
      expect(invoke).toHaveBeenCalledWith('send_app_notification', { title: '123', body: 'Body' });
    });

    it('converts body to string', async () => {
      await sendNativeNotification('Title', 456);
      expect(invoke).toHaveBeenCalledWith('send_app_notification', { title: 'Title', body: '456' });
    });

    it('resolves without error when invoke succeeds', async () => {
      await expect(sendNativeNotification('T', 'B')).resolves.not.toThrow();
    });

    it('resolves without error when invoke fails', async () => {
      invoke.mockRejectedValueOnce(new Error('IPC unavailable'));
      await expect(sendNativeNotification('T', 'B')).resolves.not.toThrow();
    });

    it('handles empty strings', async () => {
      await sendNativeNotification('', '');
      expect(invoke).toHaveBeenCalledWith('send_app_notification', { title: '', body: '' });
    });
  });
});
