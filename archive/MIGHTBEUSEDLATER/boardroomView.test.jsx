import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

vi.mock('../services/joseCommandRouterService', () => ({
  createJoseCommandRoute: vi.fn()
}));

vi.mock('../services/hectorResearchService', () => ({
  fetchRssSources: vi.fn().mockResolvedValue([])
}));

vi.mock('../lib/durableStore', () => ({
  durableGet: vi.fn().mockReturnValue(null),
  durableSet: vi.fn()
}));

const { BoardroomView } = await import('../components/BoardroomView');

describe('BoardroomView', () => {
  it('renders without throwing (regression: App.tsx lazy() must map to the named export)', () => {
    // This is the regression this test guards: App.tsx does
    // `lazy(() => import('./components/BoardroomView'))` and relies on a
    // `.then((mod) => ({ default: mod.BoardroomView }))` mapping because this
    // module only has a named export, no default export. Omitting that
    // mapping makes React.lazy resolve `undefined` as the component type,
    // which crashes the whole app with an uncaught TypeError the moment a
    // user opens the Boardroom Sessions tab (found via live browser
    // click-through during the Sprint 3 discoverability audit, 2026-07-02).
    expect(() => render(<BoardroomView />)).not.toThrow();
  });

  it('has no default export — callers must wrap with { default: mod.BoardroomView }', async () => {
    const mod = await import('../components/BoardroomView');
    expect(mod.default).toBeUndefined();
    expect(typeof mod.BoardroomView).toBe('function');
  });

  it('shows the new-session form', () => {
    render(<BoardroomView />);
    expect(screen.getByPlaceholderText(/session topic/i)).toBeInTheDocument();
    expect(screen.getByText(/convene session/i)).toBeInTheDocument();
  });
});
