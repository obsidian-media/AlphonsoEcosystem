import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

vi.mock('../AgentAvatar', () => ({ AgentAvatar: vi.fn(() => null) }));
vi.mock('framer-motion', () => ({
  motion: {
    div: 'div',
    span: 'span',
    h1: 'h1',
    h2: 'h2',
    h3: 'h3',
    p: 'p',
    button: 'button',
    article: 'article',
    figure: 'figure',
    section: 'section'
  }
}));
vi.mock('../assets/alphonso-mascot.webp', () => ({ default: 'alphonso-mascot' }));
vi.mock('../assets/jose-mascot.webp', () => ({ default: 'jose-mascot' }));
vi.mock('../assets/miya-mascot-main.webp', () => ({ default: 'miya-mascot' }));

import MarketingLandingPage from '../../components/MarketingLandingPage';

describe('MarketingLandingPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    const { container } = render(<MarketingLandingPage />);
    expect(container).toBeTruthy();
  });

  it('renders landing content', () => {
    const { container } = render(<MarketingLandingPage />);
    expect(container.querySelectorAll('div').length).toBeGreaterThan(0);
  });
});