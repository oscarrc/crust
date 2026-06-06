import { useEffect, useSyncExternalStore } from 'react';
import { mountToaster, toastStore } from './vanilla';
import type { Toast, ToasterOptions } from './vanilla';

// Stable reference: getServerSnapshot must return the same value every
// call or React warns and falls into a render loop.
const EMPTY: readonly Toast[] = [];
const getServerSnapshot = () => EMPTY;

/**
 * Concurrent-safe read of the active toasts (e.g. for badge counts).
 * Rendering is handled by `<Toaster />` / `mountToaster` — not this hook.
 */
export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    getServerSnapshot
  );
}

export interface ToasterProps extends ToasterOptions {}

/**
 * Mounts the vanilla toaster for the lifetime of the component.
 * Options are read once at mount — Crust is opinionated, not reactive,
 * about its own configuration.
 */
export function Toaster(props: ToasterProps) {
  useEffect(() => {
    const handle = mountToaster(props);
    return handle.unmount;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-time options by design
  }, []);
  return null;
}
