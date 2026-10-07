import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_URL } from '../lib/api';

// The Render free tier sleeps after 15 idle minutes and takes ~30-60s to wake. Ping /healthz
// as soon as the app loads so the server is warm by the time the user scans or imports a
// recipe. One ping loop for the whole app; ServerWakeBanner shows the status wherever it's
// placed (login form, Home).

const SHOW_AFTER_MS = 1200;   // don't flash the banner if the server is already up
const RETRY_EVERY_MS = 5000;
// Render can hold a request open while it boots, and mobile browsers may not time it out
// for minutes — cap each ping so one hung request can't keep the banner up forever.
const REQUEST_TIMEOUT_MS = 15000;
const GIVE_UP_AFTER_MS = 120000;

export type ServerStatus = 'checking' | 'waking' | 'ready' | 'hidden';

const ServerStatusContext = createContext<ServerStatus>('checking');

export const ServerStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<ServerStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    const started = Date.now();
    const showTimer = setTimeout(() => {
      if (!cancelled) setStatus(s => (s === 'checking' ? 'waking' : s));
    }, SHOW_AFTER_MS);
    // Absolute deadline, independent of any in-flight request.
    const giveUpTimer = setTimeout(() => {
      cancelled = true;
      controller?.abort();
      setStatus('hidden');  // give up quietly; screens show their own errors
    }, GIVE_UP_AFTER_MS);

    const ping = async () => {
      while (!cancelled && Date.now() - started < GIVE_UP_AFTER_MS) {
        controller = new AbortController();
        const abortTimer = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
        try {
          const res = await fetch(`${API_URL}/healthz`, { cache: 'no-store', signal: controller.signal });
          if (res.ok) {
            if (cancelled) return;
            clearTimeout(giveUpTimer);
            setStatus(s => (s === 'waking' ? 'ready' : 'hidden'));
            setTimeout(() => !cancelled && setStatus('hidden'), 1800);
            return;
          }
        } catch {
          // Server still asleep, gateway error, or this attempt timed out — retry below.
        } finally {
          clearTimeout(abortTimer);
        }
        await new Promise(r => setTimeout(r, RETRY_EVERY_MS));
      }
    };
    ping();

    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(showTimer);
      clearTimeout(giveUpTimer);
    };
  }, []);

  return <ServerStatusContext.Provider value={status}>{children}</ServerStatusContext.Provider>;
};

export const useServerStatus = () => useContext(ServerStatusContext);
