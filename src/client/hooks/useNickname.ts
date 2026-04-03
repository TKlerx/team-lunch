import { useState, useCallback } from 'react';

const STORAGE_KEY = 'team_lunch_nickname';

/**
 * Read/write the user's nickname from localStorage.
 * Returns `null` when no nickname has been set yet (first visit).
 */
export function useNickname() {
  const [nickname, setNickname] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const updateNickname = useCallback((name: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 30) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setNickname(trimmed);
  }, []);

  const clearNickname = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setNickname(null);
  }, []);

  return { nickname, updateNickname, clearNickname } as const;
}
