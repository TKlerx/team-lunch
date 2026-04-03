import { useCallback, useState } from 'react';

const STORAGE_KEY = 'team_lunch_phase_notifications_enabled';

export function useNotificationPreference() {
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return true;
      return stored === 'true';
    } catch {
      return true;
    }
  });

  const toggleNotificationsEnabled = useCallback(() => {
    setNotificationsEnabled((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  }, []);

  return { notificationsEnabled, toggleNotificationsEnabled } as const;
}
