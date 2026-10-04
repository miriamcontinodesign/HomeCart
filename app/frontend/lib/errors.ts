// Turns API failures into copy for ErrorCard. HomeCart runs on free tiers (free AI models,
// a Render backend that sleeps when idle), so most failures are temporary — say so.

import { QuotaExceededError } from './api';

export type FriendlyError = {
  kind: 'quota' | 'busy' | 'offline' | 'unknown';
  title: string;
  message: string;
  retryable: boolean;
};

export function describeError(err: unknown): FriendlyError {
  if (err instanceof QuotaExceededError) {
    return {
      kind: 'quota',
      title: "You've reached today's limit",
      message: `${err.message} Add your own AI key under Profile → Settings for unlimited use.`,
      retryable: false,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  // fetch() rejects with a TypeError when the server can't be reached at all.
  if (err instanceof TypeError || /failed to fetch|network/i.test(msg)) {
    return {
      kind: 'offline',
      title: "Can't reach HomeCart right now",
      message: 'The server may be waking up — it naps when nobody has used it for a while. Give it about 30 seconds and try again.',
      retryable: true,
    };
  }
  if (/busy|HTTP 50[234]|parse error/i.test(msg)) {
    return {
      kind: 'busy',
      title: 'The AI is taking a breather',
      message: 'HomeCart runs on free AI models, which get busy at peak times. Wait a minute and try again.',
      retryable: true,
    };
  }
  return {
    kind: 'unknown',
    title: 'Something went wrong',
    message: msg || 'Please try again.',
    retryable: true,
  };
}
