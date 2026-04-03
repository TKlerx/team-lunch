import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Returns remaining seconds until `endsAt` (ISO string).
 * Updates every second. Returns 0 when expired.
 */
export function useCountdown(endsAt: string | null | undefined): number {
  const calcRemaining = useCallback(() => {
    if (!endsAt) return 0;
    const diff = new Date(endsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 1000));
  }, [endsAt]);

  const [remaining, setRemaining] = useState(calcRemaining);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setRemaining(calcRemaining());

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setRemaining(calcRemaining());
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [calcRemaining]);

  return remaining;
}

/**
 * Returns elapsed seconds since `startsAt` (ISO string).
 * Updates every second. Returns 0 when timestamp is absent or in the future.
 */
export function useElapsedSince(startsAt: string | null | undefined): number {
  const calcElapsed = useCallback(() => {
    if (!startsAt) return 0;
    const diff = Date.now() - new Date(startsAt).getTime();
    return Math.max(0, Math.floor(diff / 1000));
  }, [startsAt]);

  const [elapsed, setElapsed] = useState(calcElapsed);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setElapsed(calcElapsed());

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setElapsed(calcElapsed());
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [calcElapsed]);

  return elapsed;
}

/**
 * Format seconds into HH:MM:SS or MM:SS when < 1 hour.
 */
export function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
