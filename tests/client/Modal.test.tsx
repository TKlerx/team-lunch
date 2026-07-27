import { render, screen, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { Modal } from '../../src/client/components/ui/Modal.js';

// Confirm-dialog hosts are countdown views that re-render once per second and pass an
// inline `onClose`. If the focus effect depends on that identity it re-fires every tick
// and drags focus back to the first button — silently changing which action Enter hits.
function CountdownHost() {
  const [, setTick] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setTick((tick) => tick + 1)}>
        tick
      </button>
      <Modal open onClose={() => undefined}>
        <button type="button">Cancel</button>
        <button type="button">Confirm</button>
      </Modal>
    </>
  );
}

describe('Modal focus handling', () => {
  it('focuses the first focusable element when opened', () => {
    render(<CountdownHost />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('keeps focus where the user put it across parent re-renders', () => {
    render(<CountdownHost />);
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    act(() => confirm.focus());

    act(() => {
      screen.getByRole('button', { name: 'tick' }).click();
    });

    expect(document.activeElement).toBe(confirm);
  });
});
