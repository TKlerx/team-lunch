import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getStoredAdminOfficeLocationId,
  setStoredAdminOfficeLocationId,
} from '../config.js';

export interface AdminOfficeLocationOption {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
}

interface AdminOfficeContextValue {
  isAdmin: boolean;
  officeLocations: AdminOfficeLocationOption[];
  selectedOfficeLocationId: string | null;
  canSwitchOfficeLocation: boolean;
  setSelectedOfficeLocationId: (officeLocationId: string) => void;
}

interface AdminOfficeProviderProps {
  authenticated: boolean;
  isAdmin: boolean;
  officeLocationId: string | null;
  officeLocations: AdminOfficeLocationOption[];
  children: ReactNode;
}

const AdminOfficeContext = createContext<AdminOfficeContextValue>({
  isAdmin: false,
  officeLocations: [],
  selectedOfficeLocationId: null,
  canSwitchOfficeLocation: false,
  setSelectedOfficeLocationId: () => {
    // noop default
  },
});

function resolvePreferredOfficeLocationId(
  officeLocations: AdminOfficeLocationOption[],
  currentSelection: string | null,
  assignedOfficeLocationId: string | null,
): string | null {
  const activeOfficeLocations = officeLocations.filter((location) => location.isActive);
  const activeIds = new Set(activeOfficeLocations.map((location) => location.id));

  const candidates = [
    currentSelection,
    getStoredAdminOfficeLocationId(),
    assignedOfficeLocationId,
    activeOfficeLocations[0]?.id ?? null,
  ];

  for (const candidate of candidates) {
    if (candidate && activeIds.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function AdminOfficeProvider({
  authenticated,
  isAdmin,
  officeLocationId,
  officeLocations,
  children,
}: AdminOfficeProviderProps) {
  const activeOfficeLocations = useMemo(
    () => officeLocations.filter((location) => location.isActive),
    [officeLocations],
  );
  const [selectedOfficeLocationId, setSelectedOfficeLocationIdState] = useState<string | null>(
    () =>
      authenticated && (isAdmin || officeLocations.length > 0)
        ? resolvePreferredOfficeLocationId(officeLocations, null, officeLocationId)
        : null,
  );

  useEffect(() => {
    if (!authenticated || (!isAdmin && officeLocations.length === 0)) {
      setSelectedOfficeLocationIdState(null);
      setStoredAdminOfficeLocationId(null);
      return;
    }

    const preferredOfficeLocationId = resolvePreferredOfficeLocationId(
      officeLocations,
      selectedOfficeLocationId,
      officeLocationId,
    );
    setSelectedOfficeLocationIdState(preferredOfficeLocationId);
    setStoredAdminOfficeLocationId(preferredOfficeLocationId);
  }, [authenticated, isAdmin, officeLocationId, officeLocations, selectedOfficeLocationId]);

  const setSelectedOfficeLocationId = useCallback(
    (nextOfficeLocationId: string) => {
      if (!activeOfficeLocations.some((location) => location.id === nextOfficeLocationId)) {
        return;
      }

      setSelectedOfficeLocationIdState(nextOfficeLocationId);
      setStoredAdminOfficeLocationId(nextOfficeLocationId);
    },
    [activeOfficeLocations],
  );

  const value = useMemo<AdminOfficeContextValue>(
    () => ({
      isAdmin,
      officeLocations: activeOfficeLocations,
      selectedOfficeLocationId,
      canSwitchOfficeLocation: isAdmin || activeOfficeLocations.length > 1,
      setSelectedOfficeLocationId,
    }),
    [activeOfficeLocations, isAdmin, selectedOfficeLocationId, setSelectedOfficeLocationId],
  );

  return <AdminOfficeContext.Provider value={value}>{children}</AdminOfficeContext.Provider>;
}

export function useAdminOfficeContext(): AdminOfficeContextValue {
  return useContext(AdminOfficeContext);
}
