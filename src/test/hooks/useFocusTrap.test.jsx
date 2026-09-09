import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRef, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

// A small harness rather than testing the hook in isolation via renderHook:
// focus trapping is fundamentally about real DOM focus order, tabindex, and
// document.activeElement -- a fake DOM would just be re-asserting the
// hook's own logic back at itself.
function Harness({ active }) {
  const containerRef = useRef(null);
  useFocusTrap(containerRef, active);
  return (
    <div>
      <button>outside-before</button>
      {active && (
        <div ref={containerRef} data-testid="container">
          <button>first</button>
          <button>middle</button>
          <button>last</button>
        </div>
      )}
      <button>outside-after</button>
    </div>
  );
}

function ToggleableHarness({ initialActive }) {
  const [active, setActive] = useState(initialActive);
  return (
    <div>
      <button onClick={() => setActive(true)}>trigger</button>
      <Harness active={active} />
      <button onClick={() => setActive(false)}>close</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('moves focus into the container when it becomes active', () => {
    render(<Harness active={true} />);
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('does not steal focus from an element the caller already focused', () => {
    // MemorySearch.tsx focuses its own search input on open -- the trap
    // must not fight that by refocusing "first" over it.
    function AlreadyFocused({ active }) {
      const containerRef = useRef(null);
      useFocusTrap(containerRef, active);
      return (
        <div ref={containerRef}>
          <button>first</button>
          <input autoFocus data-testid="search-input" />
        </div>
      );
    }
    render(<AlreadyFocused active={true} />);
    // autoFocus runs synchronously enough in jsdom that by the time the
    // effect's contains() check runs, the input already has focus.
    expect(document.activeElement).toBe(screen.getByTestId('search-input'));
  });

  it('wraps Tab from the last focusable element back to the first', () => {
    render(<Harness active={true} />);
    screen.getByText('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps Shift+Tab from the first focusable element back to the last', () => {
    render(<Harness active={true} />);
    screen.getByText('first').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('last'));
  });

  it('does not wrap Tab between the first and last elements', () => {
    render(<Harness active={true} />);
    screen.getByText('first').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Real Tab navigation (not intercepted here, jsdom doesn't move focus on
    // Tab by itself) would leave focus on 'first' -- confirms preventDefault
    // only fires at the wrap boundary, not on every keypress.
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('restores focus to the previously focused element when it becomes inactive', () => {
    render(<ToggleableHarness initialActive={false} />);
    const trigger = screen.getByText('trigger');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByText('first'));

    fireEvent.click(screen.getByText('close'));
    expect(document.activeElement).toBe(trigger);
  });

  it('restores focus to the previously focused element when the component unmounts entirely', () => {
    // A different code path than the deactivation test above: cleanup fires
    // because React tears down the tree, not because the active prop flipped.
    const outsideButton = document.createElement('button');
    outsideButton.textContent = 'page-trigger';
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    const { unmount } = render(<Harness active={true} />);
    expect(document.activeElement).toBe(screen.getByText('first'));

    unmount();
    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
  });

  it('is a no-op when the container ref has no element (defensive)', () => {
    function NoContainer({ active }) {
      const containerRef = useRef(null);
      useFocusTrap(containerRef, active);
      return <button>only-button</button>;
    }
    expect(() => render(<NoContainer active={true} />)).not.toThrow();
  });
});
