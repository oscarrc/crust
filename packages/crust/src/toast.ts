import { normalizeDuration, removeAll, toastStore } from './store';
import type { ToastOptions, ToastPatch, ToastType } from './store';

type ToastContent = string | { title: string; message?: string };

export interface PromiseMessages<T> {
  loading: ToastContent;
  success: ToastContent | ((value: T) => ToastContent);
  error: ToastContent | ((reason: unknown) => ToastContent);
}

const asPatch = (content: ToastContent): { title: string; message?: string } =>
  typeof content === 'string' ? { title: content } : content;

const settle = <V>(
  content: ToastContent | ((value: V) => ToastContent),
  value: V
): ToastContent => (typeof content === 'function' ? content(value) : content);

type Shorthand = (title: string, options?: Omit<ToastOptions, 'type'>) => string;

const shorthand =
  (type: ToastType): Shorthand =>
  (title, options) =>
    toastStore.add(title, { ...options, type });

export const toast = Object.assign(
  (title: string, options?: ToastOptions): string => toastStore.add(title, options),
  {
    success: shorthand('success'),
    error: shorthand('error'),
    info: shorthand('info'),
    warning: shorthand('warning'),
    /** Loading toasts persist until updated or dismissed. */
    loading: (title: string, options?: Omit<ToastOptions, 'type'>) =>
      toastStore.add(title, { duration: Infinity, ...options, type: 'loading' }),
    /** Patch a live (or queued) toast. A new `duration` restarts its timer. */
    update: (id: string, patch: ToastPatch) => toastStore.update(id, patch),
    /**
     * Show a loading toast that morphs into success/error when the
     * promise settles. Returns the toast id.
     */
    promise: <T>(
      promise: Promise<T>,
      messages: PromiseMessages<T>,
      options?: Omit<ToastOptions, 'type' | 'duration'> & {
        duration?: number;
        /** Open the outcome's message panel when the promise settles. */
        expandOnSettle?: boolean;
      }
    ): string => {
      const { expandOnSettle, ...baseOptions } = options ?? {};
      const id = toastStore.add(asPatch(messages.loading).title, {
        ...baseOptions,
        message: asPatch(messages.loading).message ?? baseOptions.message,
        type: 'loading',
        duration: Infinity
      });
      const conclude = (type: ToastType, content: ToastContent) =>
        toastStore.update(id, {
          message: undefined,
          ...asPatch(content),
          type,
          duration: normalizeDuration(baseOptions.duration),
          ...(expandOnSettle ? { expanded: true } : {})
        });
      promise
        .then((value) => conclude('success', settle(messages.success, value)))
        .catch((reason) => conclude('error', settle(messages.error, reason)));
      return id;
    },
    /** Dismiss one toast by id, or every toast (and the queue) with no argument. */
    dismiss: (id?: string) => (id === undefined ? removeAll() : toastStore.remove(id))
  }
);
