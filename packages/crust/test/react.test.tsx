import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { Toaster, useToasts } from '../src/react';
import { toast } from '../src/vanilla';

beforeEach(() => {
  act(() => toast.dismiss());
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function Badge() {
  const toasts = useToasts();
  return <span data-testid="count">{toasts.length}</span>;
}

describe('useToasts', () => {
  test('re-renders when the store changes', () => {
    render(<Badge />);
    expect(screen.getByTestId('count').textContent).toBe('0');
    act(() => {
      toast('one', { duration: Infinity });
      toast('two', { duration: Infinity });
    });
    expect(screen.getByTestId('count').textContent).toBe('2');
    act(() => toast.dismiss());
    expect(screen.getByTestId('count').textContent).toBe('0');
  });
});

describe('Toaster', () => {
  test('mounts the crust region and renders toasts', () => {
    render(<Toaster />);
    expect(document.querySelector('.crust-region')).toBeTruthy();
    act(() => {
      toast.success('saved', { duration: Infinity });
    });
    expect(document.querySelector('.crust-toast.crust-success')).toBeTruthy();
  });

  test('forwards mount options', () => {
    render(<Toaster position="top-left" />);
    expect(document.querySelector('.crust-pos-top-left')).toBeTruthy();
  });

  test('unmounts the region on cleanup', () => {
    const { unmount } = render(<Toaster />);
    unmount();
    expect(document.querySelector('.crust-region')).toBeNull();
  });
});
