import { vi } from 'vitest';

export const mockInvoke = vi.fn();
export const mockListen = vi.fn();
export const mockUnlisten = vi.fn();
export const mockEmit = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
  listen: mockListen,
  unlisten: mockUnlisten,
  emit: mockEmit,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
  emit: mockEmit,
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    listen: mockListen,
    emit: mockEmit,
    onFocusChange: vi.fn(),
    setTitle: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
    setSize: vi.fn(),
    setPosition: vi.fn(),
    setFullscreen: vi.fn(),
    setResizable: vi.fn(),
    setMinSize: vi.fn(),
    setMaxSize: vi.fn(),
    setDecorations: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setSkipTaskbar: vi.fn(),
    startDragging: vi.fn(),
    print: vi.fn(),
  }),
  Window: vi.fn(),
}));

vi.mock('@tauri-apps/api/clipboard', () => ({
  readText: vi.fn().mockResolvedValue(''),
  writeText: vi.fn().mockResolvedValue(undefined),
  readImage: vi.fn().mockResolvedValue(null),
  writeImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/dialog', () => ({
  open: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue(null),
  message: vi.fn().mockResolvedValue(undefined),
  ask: vi.fn().mockResolvedValue(false),
  confirm: vi.fn().mockResolvedValue(false),
}));

vi.mock('@tauri-apps/api/fs', () => ({
  readTextFile: vi.fn().mockResolvedValue(''),
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  readDir: vi.fn().mockResolvedValue([]),
  createDir: vi.fn().mockResolvedValue(undefined),
  removeDir: vi.fn().mockResolvedValue(undefined),
  removeFile: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(false),
  BaseDirectory: { AppConfig: 1, AppData: 2, AppLocalData: 3, AppCache: 4, AppLog: 5, Document: 6, Download: 7, Desktop: 8, Home: 9, Temp: 10, Executable: 11, Resource: 12 },
}));

vi.mock('@tauri-apps/api/notification', () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue('granted'),
  sendNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/os', () => ({
  platform: vi.fn().mockReturnValue('windows'),
  version: vi.fn().mockReturnValue('10.0.0'),
  type: vi.fn().mockReturnValue('Windows'),
  arch: vi.fn().mockReturnValue('x86_64'),
  family: vi.fn().mockReturnValue('windows'),
}));

vi.mock('@tauri-apps/api/process', () => ({
  relaunch: vi.fn().mockResolvedValue(undefined),
  exit: vi.fn().mockResolvedValue(undefined),
}));

export const mockTrayIcon = {
  setIcon: vi.fn().mockResolvedValue(undefined),
  setMenu: vi.fn().mockResolvedValue(undefined),
  setIconAsTemplate: vi.fn().mockResolvedValue(undefined),
  setTooltip: vi.fn().mockResolvedValue(undefined),
  setTitle: vi.fn().mockResolvedValue(undefined),
  setTempIcon: vi.fn().mockResolvedValue(undefined),
  onClick: vi.fn().mockResolvedValue(undefined),
  onDoubleClick: vi.fn().mockResolvedValue(undefined),
  onRightClick: vi.fn().mockResolvedValue(undefined),
  show: vi.fn().mockResolvedValue(undefined),
  hide: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  setIgnoreDoubleClick: vi.fn().mockResolvedValue(undefined),
};

export const mockTrayMenu = {
  append: vi.fn().mockResolvedValue(undefined),
  appendCheck: vi.fn().mockResolvedValue(undefined),
  appendSeparator: vi.fn().mockResolvedValue(undefined),
  prepend: vi.fn().mockResolvedValue(undefined),
  insert: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  removeAt: vi.fn().mockResolvedValue(undefined),
  popup: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

export const mockTrayMenuItem = {
  setEnabled: vi.fn(),
  setSelected: vi.fn(),
  setTitle: vi.fn(),
  setIcon: vi.fn(),
  setAccelerator: vi.fn(),
  onClick: vi.fn(),
};

vi.mock('@tauri-apps/api/tray', () => ({
  TrayIcon: vi.fn().mockImplementation(() => mockTrayIcon),
  Menu: vi.fn().mockImplementation(() => mockTrayMenu),
  MenuItem: vi.fn().mockImplementation(() => mockTrayMenuItem),
  CheckMenuItem: vi.fn().mockImplementation(() => mockTrayMenuItem),
  PredefinedMenuItem: vi.fn().mockImplementation(() => mockTrayMenuItem),
  Icon: vi.fn().mockImplementation(() => ({})),
  TrayIconOptions: vi.fn(),
  MenuOptions: vi.fn(),
  MenuItemOptions: vi.fn(),
}));

export function resetTauriMocks() {
  mockInvoke.mockReset();
  mockListen.mockReset();
  mockUnlisten.mockReset();
  mockEmit.mockReset();
  mockTrayIcon.setIcon.mockReset();
  mockTrayIcon.setMenu.mockReset();
  mockTrayIcon.setIconAsTemplate.mockReset();
  mockTrayIcon.setTooltip.mockReset();
  mockTrayIcon.setTitle.mockReset();
  mockTrayIcon.setTempIcon.mockReset();
  mockTrayIcon.onClick.mockReset();
  mockTrayIcon.onDoubleClick.mockReset();
  mockTrayIcon.onRightClick.mockReset();
  mockTrayIcon.show.mockReset();
  mockTrayIcon.hide.mockReset();
  mockTrayIcon.destroy.mockReset();
  mockTrayIcon.setIgnoreDoubleClick.mockReset();
  mockTrayMenu.append.mockReset();
  mockTrayMenu.appendCheck.mockReset();
  mockTrayMenu.appendSeparator.mockReset();
  mockTrayMenu.prepend.mockReset();
  mockTrayMenu.insert.mockReset();
  mockTrayMenu.remove.mockReset();
  mockTrayMenu.removeAt.mockReset();
  mockTrayMenu.popup.mockReset();
  mockTrayMenu.close.mockReset();
  mockTrayMenuItem.setEnabled.mockReset();
  mockTrayMenuItem.setSelected.mockReset();
  mockTrayMenuItem.setTitle.mockReset();
  mockTrayMenuItem.setIcon.mockReset();
  mockTrayMenuItem.setAccelerator.mockReset();
  mockTrayMenuItem.onClick.mockReset();
}

export function setupTauriInvokeMock(responses: Record<string, any>) {
  mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
    if (responses[cmd] !== undefined) {
      return typeof responses[cmd] === 'function' ? responses[cmd](args) : responses[cmd];
    }
    return { ok: true, success: true };
  });
}

export function setupTauriListenMock(handler: (event: string, payload: any) => void) {
  mockListen.mockImplementation(async (event: string, callback: (payload: any) => void) => {
    const unlisten = mockUnlisten;
    if (event.startsWith('tauri://')) {
      return unlisten;
    }
    return unlisten;
  });
}