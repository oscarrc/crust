// Public interface manifest for `@oscarrc/crust/vanilla`. This file exports
// the documented API and nothing else — package-internal exports of the
// modules below (e.g. store's removeAll/normalizeDuration) stay internal.
// tsup flattens everything into a single dist/vanilla.js, so this structure
// is invisible to consumers.
export { toastStore } from './store';
export type { CrustIcon, Toast, ToastOptions, ToastPatch, ToastType } from './store';
export { toast } from './toast';
export type { PromiseMessages } from './toast';
export { mountToaster } from './renderer';
export type { ToasterHandle, ToasterOptions, ToasterPosition } from './renderer';
