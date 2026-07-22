import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { Link } from "react-router-dom";
import {
  getAuthenticatedActorKey,
  setAuthenticatedDisplayName,
} from "../auth.js";
import RecommenderAdminPanel from "../components/RecommenderAdminPanel.js";
import { useConfirmDialog, type ConfirmDialogOptions } from "../components/ui/ConfirmDialog.js";
import { withBasePath } from "../config.js";
import { useAdminOfficeContext } from "../context/AdminOfficeContext.js";
import { useToast } from "../context/ToastContext.js";
import {
  LOCAL_PASSWORD_MAX_LENGTH,
  LOCAL_PASSWORD_MIN_LENGTH,
  type AuthConfigResponse,
  type OfficeLocation,
  type OfficeWeekday,
} from "../../lib/types.js";
import { getErrorMessage } from "../lib/errorMessage.js";

const OFFICE_WEEKDAY_OPTIONS: Array<{ value: OfficeWeekday; label: string }> = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];
const FOOD_DURATIONS = [1, 5, 10, 15, 20, 25, 30] as const;

type AdminAuth = AuthConfigResponse["auth"];
type AdminUser = AdminAuth["users"][number];

type OfficeSettingsDraft = {
  autoStartPollEnabled: boolean;
  autoStartPollWeekdays: OfficeWeekday[];
  autoStartPollFinishTime: string;
  defaultFoodSelectionDurationMinutes: number;
};

type AdminDrafts = {
  selectedApprovalOffices: Record<string, string>;
  setSelectedApprovalOffices: Dispatch<SetStateAction<Record<string, string>>>;
  selectedUserOffices: Record<string, string>;
  setSelectedUserOffices: Dispatch<SetStateAction<Record<string, string>>>;
  selectedUserOfficeMemberships: Record<string, string[]>;
  setSelectedUserOfficeMemberships: Dispatch<
    SetStateAction<Record<string, string[]>>
  >;
  displayNameDrafts: Record<string, string>;
  setDisplayNameDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  emailDrafts: Record<string, string>;
  setEmailDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  officeNameDrafts: Record<string, string>;
  setOfficeNameDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  officeSettingsDrafts: Record<string, OfficeSettingsDraft>;
  setOfficeSettingsDrafts: Dispatch<
    SetStateAction<Record<string, OfficeSettingsDraft>>
  >;
};

async function fetchAdminConfig(): Promise<AuthConfigResponse> {
  const response = await fetch(withBasePath("/api/auth/config"), {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to load admin config");
  }
  return response.json() as Promise<AuthConfigResponse>;
}

async function requestAdmin(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<Response> {
  const response = await fetch(withBasePath(path), {
    credentials: "include",
    ...init,
    headers: init.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init.headers,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error || fallback);
  }
  return response;
}

function getPreferredOfficeLocationId(
  officeLocations: OfficeLocation[],
  current?: string | null,
): string {
  if (
    current &&
    officeLocations.some(
      (location) => location.id === current && location.isActive,
    )
  ) {
    return current;
  }
  return officeLocations.find((location) => location.isActive)?.id ?? "";
}

function getSelectedUserOfficeLocationId(
  officeLocations: OfficeLocation[],
  current?: string | null,
): string {
  if (
    current &&
    officeLocations.some(
      (location) => location.id === current && location.isActive,
    )
  ) {
    return current;
  }
  return "";
}

function orderWeekdays(weekdays: OfficeWeekday[]): OfficeWeekday[] {
  return OFFICE_WEEKDAY_OPTIONS.map((option) => option.value).filter(
    (weekday) => weekdays.includes(weekday),
  );
}

function initialOfficeSettings(location: OfficeLocation): OfficeSettingsDraft {
  return {
    autoStartPollEnabled: location.autoStartPollEnabled,
    autoStartPollWeekdays: orderWeekdays(location.autoStartPollWeekdays),
    autoStartPollFinishTime: location.autoStartPollFinishTime ?? "",
    defaultFoodSelectionDurationMinutes:
      location.defaultFoodSelectionDurationMinutes,
  };
}

function settingsChanged(
  location: OfficeLocation,
  draft: OfficeSettingsDraft,
): boolean {
  return (
    draft.autoStartPollEnabled !== location.autoStartPollEnabled ||
    draft.autoStartPollFinishTime !==
      (location.autoStartPollFinishTime ?? "") ||
    draft.defaultFoodSelectionDurationMinutes !==
      location.defaultFoodSelectionDurationMinutes ||
    draft.autoStartPollWeekdays.join("|") !==
      location.autoStartPollWeekdays.join("|")
  );
}

function useAdminDrafts(): AdminDrafts {
  const [selectedApprovalOffices, setSelectedApprovalOffices] = useState<
    Record<string, string>
  >({});
  const [selectedUserOffices, setSelectedUserOffices] = useState<
    Record<string, string>
  >({});
  const [selectedUserOfficeMemberships, setSelectedUserOfficeMemberships] =
    useState<Record<string, string[]>>({});
  const [displayNameDrafts, setDisplayNameDrafts] = useState<
    Record<string, string>
  >({});
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [officeNameDrafts, setOfficeNameDrafts] = useState<
    Record<string, string>
  >({});
  const [officeSettingsDrafts, setOfficeSettingsDrafts] = useState<
    Record<string, OfficeSettingsDraft>
  >({});

  return useMemo(
    () => ({
      selectedApprovalOffices,
      setSelectedApprovalOffices,
      selectedUserOffices,
      setSelectedUserOffices,
      selectedUserOfficeMemberships,
      setSelectedUserOfficeMemberships,
      displayNameDrafts,
      setDisplayNameDrafts,
      emailDrafts,
      setEmailDrafts,
      officeNameDrafts,
      setOfficeNameDrafts,
      officeSettingsDrafts,
      setOfficeSettingsDrafts,
    }),
    [
      displayNameDrafts,
      emailDrafts,
      officeNameDrafts,
      officeSettingsDrafts,
      selectedApprovalOffices,
      selectedUserOfficeMemberships,
      selectedUserOffices,
    ],
  );
}

function syncUserDrafts(auth: AdminAuth, drafts: AdminDrafts): void {
  drafts.setSelectedUserOffices((current) =>
    Object.fromEntries(
      auth.users.map((entry) => [
        entry.email,
        current[entry.email] ||
          getSelectedUserOfficeLocationId(
            auth.officeLocations,
            entry.officeLocationId,
          ),
      ]),
    ),
  );
  drafts.setSelectedUserOfficeMemberships((current) =>
    Object.fromEntries(
      auth.users.map((entry) => [
        entry.email,
        current[entry.email] || entry.assignedOfficeLocationIds || [],
      ]),
    ),
  );
  drafts.setDisplayNameDrafts((current) =>
    Object.fromEntries(
      auth.users.map((entry) => [
        entry.email,
        entry.email in current
          ? current[entry.email]
          : (entry.displayName ?? ""),
      ]),
    ),
  );
  drafts.setEmailDrafts((current) =>
    Object.fromEntries(
      auth.users.map((entry) => [
        entry.email,
        current[entry.email] || entry.email,
      ]),
    ),
  );
}

function syncOfficeDrafts(auth: AdminAuth, drafts: AdminDrafts): void {
  drafts.setSelectedApprovalOffices((current) =>
    Object.fromEntries(
      auth.pendingApprovals.map((entry) => [
        entry.email,
        current[entry.email] ||
          getPreferredOfficeLocationId(auth.officeLocations),
      ]),
    ),
  );
  drafts.setOfficeNameDrafts((current) =>
    Object.fromEntries(
      auth.officeLocations.map((location) => [
        location.id,
        location.id in current ? current[location.id] : location.name,
      ]),
    ),
  );
  drafts.setOfficeSettingsDrafts((current) =>
    Object.fromEntries(
      auth.officeLocations.map((location) => [
        location.id,
        current[location.id] || initialOfficeSettings(location),
      ]),
    ),
  );
}

function useAdminConfig() {
  const { setPendingApprovalCount } = useAdminOfficeContext();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AdminAuth | null>(null);
  const [error, setError] = useState("");
  const [newLocalUserOfficeLocationId, setNewLocalUserOfficeLocationId] =
    useState("");
  const drafts = useAdminDrafts();

  const applyConfig = (auth: AdminAuth) => {
    setConfig(auth);
    setPendingApprovalCount(auth.pendingApprovals.length);
    setNewLocalUserOfficeLocationId((current) =>
      getPreferredOfficeLocationId(auth.officeLocations, current),
    );
    syncOfficeDrafts(auth, drafts);
    syncUserDrafts(auth, drafts);
  };

  const refreshConfig = async () => {
    const payload = await fetchAdminConfig();
    applyConfig(payload.auth);
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError("");
      try {
        await refreshConfig();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load admin data",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return {
    loading,
    config,
    error,
    setError,
    refreshConfig,
    newLocalUserOfficeLocationId,
    setNewLocalUserOfficeLocationId,
    drafts,
  };
}

function useApprovalActions(
  selectedApprovalOffices: Record<string, string>,
  refreshConfig: () => Promise<void>,
  setError: (error: string) => void,
) {
  const [updatingApprovalEmail, setUpdatingApprovalEmail] = useState<
    string | null
  >(null);

  const mutateApproval = async (
    email: string,
    action: "approve" | "decline",
  ) => {
    setUpdatingApprovalEmail(email);
    setError("");
    try {
      const officeLocationId = selectedApprovalOffices[email];
      if (action === "approve" && !officeLocationId)
        throw new Error("Office location is required");
      await requestAdmin(
        `/api/auth/users/${action}`,
        {
          method: "POST",
          body: JSON.stringify({ email, officeLocationId }),
        },
        `Failed to ${action} user`,
      );
      await refreshConfig();
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Approval update failed",
      );
    } finally {
      setUpdatingApprovalEmail(null);
    }
  };

  return {
    updatingApprovalEmail,
    approveUser: (email: string) => mutateApproval(email, "approve"),
    declineUser: (email: string) => mutateApproval(email, "decline"),
  };
}

function useLocalUserActions(
  refreshConfig: () => Promise<void>,
  setError: (error: string) => void,
  officeLocationId: string,
) {
  const [newLocalUserEmail, setNewLocalUserEmail] = useState("");
  const [newLocalUserPassword, setNewLocalUserPassword] = useState("");
  const [creatingLocalUser, setCreatingLocalUser] = useState(false);
  const [createdLocalUser, setCreatedLocalUser] = useState<{
    email: string;
    password: string;
    generated: boolean;
  } | null>(null);

  const passwordValidationError = useMemo(() => {
    const trimmed = newLocalUserPassword.trim();
    if (!trimmed) return "";
    if (trimmed.length < LOCAL_PASSWORD_MIN_LENGTH) {
      return `Password must be at least ${LOCAL_PASSWORD_MIN_LENGTH} characters.`;
    }
    if (trimmed.length > LOCAL_PASSWORD_MAX_LENGTH) {
      return `Password must be at most ${LOCAL_PASSWORD_MAX_LENGTH} characters.`;
    }
    return "";
  }, [newLocalUserPassword]);

  const createLocalUser = async (event: FormEvent) => {
    event.preventDefault();
    if (passwordValidationError) {
      setError(passwordValidationError);
      return;
    }
    setCreatingLocalUser(true);
    setCreatedLocalUser(null);
    setError("");
    try {
      const response = await requestAdmin(
        "/api/auth/local/users/generate",
        {
          method: "POST",
          body: JSON.stringify({
            email: newLocalUserEmail.trim(),
            password: newLocalUserPassword.trim() || undefined,
            officeLocationId: officeLocationId || undefined,
          }),
        },
        "Failed to create local user",
      );
      const payload = (await response.json().catch(() => null)) as {
        email?: string;
        password?: string;
        generated?: boolean;
      } | null;
      if (!payload?.email || !payload.password)
        throw new Error("Failed to create local user");
      setCreatedLocalUser({
        email: payload.email,
        password: payload.password,
        generated: !!payload.generated,
      });
      setNewLocalUserPassword("");
      setNewLocalUserEmail("");
      await refreshConfig();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create local user",
      );
    } finally {
      setCreatingLocalUser(false);
    }
  };

  return {
    newLocalUserEmail,
    setNewLocalUserEmail,
    newLocalUserPassword,
    setNewLocalUserPassword,
    creatingLocalUser,
    createdLocalUser,
    passwordValidationError,
    createLocalUser,
  };
}

function useOfficeActions(
  drafts: Pick<AdminDrafts, "officeNameDrafts" | "officeSettingsDrafts">,
  refreshConfig: () => Promise<void>,
  setError: (error: string) => void,
) {
  const [newOfficeName, setNewOfficeName] = useState("");
  const [creatingOffice, setCreatingOffice] = useState(false);
  const [updatingOfficeId, setUpdatingOfficeId] = useState<string | null>(null);
  const { showToast } = useToast();

  const runOfficeAction = async (
    officeId: string,
    action: () => Promise<void>,
    fallback: string,
  ) => {
    setUpdatingOfficeId(officeId);
    setError("");
    try {
      await action();
      await refreshConfig();
    } catch (officeError) {
      showToast({ tone: "error", message: getErrorMessage(officeError, fallback) });
    } finally {
      setUpdatingOfficeId(null);
    }
  };

  const createOffice = async (event: FormEvent) => {
    event.preventDefault();
    setCreatingOffice(true);
    setError("");
    try {
      await requestAdmin(
        "/api/auth/offices",
        {
          method: "POST",
          body: JSON.stringify({ name: newOfficeName.trim() }),
        },
        "Failed to create office",
      );
      setNewOfficeName("");
      await refreshConfig();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Office creation failed",
      );
    } finally {
      setCreatingOffice(false);
    }
  };

  const renameOffice = (officeId: string) =>
    runOfficeAction(
      officeId,
      () =>
        requestAdmin(
          `/api/auth/offices/${officeId}/rename`,
          {
            method: "POST",
            body: JSON.stringify({
              name: drafts.officeNameDrafts[officeId]?.trim() ?? "",
            }),
          },
          "Failed to rename office",
        ).then(() => undefined),
      "Office rename failed",
    );

  const deactivateOffice = (officeId: string) =>
    runOfficeAction(
      officeId,
      () =>
        requestAdmin(
          `/api/auth/offices/${officeId}/deactivate`,
          { method: "POST" },
          "Failed to deactivate office",
        ).then(() => undefined),
      "Office deactivation failed",
    );

  const updateOfficeSettings = (officeId: string) =>
    runOfficeAction(
      officeId,
      () => {
        const draft = drafts.officeSettingsDrafts[officeId];
        return requestAdmin(
          `/api/auth/offices/${officeId}/settings`,
          {
            method: "POST",
            body: JSON.stringify({
              autoStartPollEnabled: draft?.autoStartPollEnabled ?? false,
              autoStartPollWeekdays: draft?.autoStartPollWeekdays ?? [],
              autoStartPollFinishTime:
                draft?.autoStartPollFinishTime?.trim() || null,
              defaultFoodSelectionDurationMinutes:
                draft?.defaultFoodSelectionDurationMinutes ?? 30,
            }),
          },
          "Failed to update office settings",
        ).then(() => undefined);
      },
      "Office settings update failed",
    );

  return {
    newOfficeName,
    setNewOfficeName,
    creatingOffice,
    updatingOfficeId,
    createOffice,
    renameOffice,
    deactivateOffice,
    updateOfficeSettings,
  };
}

type UserActionRunner = (
  email: string,
  action: () => Promise<void>,
  fallback: string,
) => Promise<void>;

type UserActionDrafts = Pick<
  AdminDrafts,
  | "selectedUserOffices"
  | "selectedUserOfficeMemberships"
  | "displayNameDrafts"
  | "emailDrafts"
>;

function simpleUserPost(
  runUserAction: UserActionRunner,
  email: string,
  action: "promote" | "block" | "unblock",
) {
  return runUserAction(
    email,
    () =>
      requestAdmin(
        `/api/auth/users/${action}`,
        {
          method: "POST",
          body: JSON.stringify({ email }),
        },
        `Failed to ${action} user`,
      ).then(() => undefined),
    action === "promote" ? "Role update failed" : "User status update failed",
  );
}

function demoteUser(
  runUserAction: UserActionRunner,
  email: string,
  drafts: UserActionDrafts,
) {
  return runUserAction(
    email,
    () =>
      requestAdmin(
        "/api/auth/users/demote",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            officeLocationId: drafts.selectedUserOffices[email] || undefined,
          }),
        },
        "Failed to demote user",
      ).then(() => undefined),
    "Role update failed",
  );
}

function assignOffice(
  runUserAction: UserActionRunner,
  email: string,
  drafts: UserActionDrafts,
) {
  return runUserAction(
    email,
    () =>
      requestAdmin(
        "/api/auth/users/assign-offices",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            officeLocationIds:
              drafts.selectedUserOfficeMemberships[email] ?? [],
            preferredOfficeLocationId:
              drafts.selectedUserOffices[email] || undefined,
          }),
        },
        "Failed to assign offices",
      ).then(() => undefined),
    "Office assignment failed",
  );
}

function saveDisplayName(
  runUserAction: UserActionRunner,
  email: string,
  drafts: UserActionDrafts,
) {
  return runUserAction(
    email,
    async () => {
      const response = await requestAdmin(
        "/api/auth/users/display-name",
        {
          method: "PUT",
          body: JSON.stringify({
            email,
            displayName: drafts.displayNameDrafts[email]?.trim() || null,
          }),
        },
        "Failed to update display name",
      );
      const payload = (await response.json().catch(() => null)) as {
        displayName?: string | null;
      } | null;
      if (email.trim().toLowerCase() === getAuthenticatedActorKey()) {
        setAuthenticatedDisplayName(payload?.displayName ?? null);
      }
    },
    "Display name update failed",
  );
}

function saveEmail(
  runUserAction: UserActionRunner,
  email: string,
  drafts: UserActionDrafts,
) {
  return runUserAction(
    email,
    () =>
      requestAdmin(
        "/api/auth/users/email",
        {
          method: "PUT",
          body: JSON.stringify({
            email,
            newEmail: drafts.emailDrafts[email]?.trim() ?? "",
          }),
        },
        "Failed to update email",
      ).then(() => undefined),
    "Email update failed",
  );
}

async function deleteUser(
  runUserAction: UserActionRunner,
  email: string,
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>,
) {
  const confirmed = await confirm({
    title: `Delete local account ${email}?`,
    consequenceText: "Historical votes and orders stay unchanged.",
    confirmLabel: "Delete local account",
    destructive: true,
  });
  if (!confirmed) {
    return;
  }
  return runUserAction(
    email,
    () =>
      requestAdmin(
        "/api/auth/users",
        {
          method: "DELETE",
          body: JSON.stringify({ email }),
        },
        "Failed to delete user",
      ).then(() => undefined),
    "User deletion failed",
  );
}

function useUserActions(
  drafts: UserActionDrafts,
  refreshConfig: () => Promise<void>,
  setError: (error: string) => void,
) {
  const [updatingUserRoleEmail, setUpdatingUserRoleEmail] = useState<
    string | null
  >(null);
  const { confirm, dialog } = useConfirmDialog();
  const { showToast } = useToast();

  const runUserAction: UserActionRunner = async (email, action, fallback) => {
    setUpdatingUserRoleEmail(email);
    setError("");
    try {
      await action();
      await refreshConfig();
    } catch (userError) {
      showToast({ tone: "error", message: getErrorMessage(userError, fallback) });
    } finally {
      setUpdatingUserRoleEmail(null);
    }
  };

  return {
    updatingUserRoleEmail,
    promoteUser: (email: string) =>
      simpleUserPost(runUserAction, email, "promote"),
    demoteUser: (email: string) => demoteUser(runUserAction, email, drafts),
    blockUser: (email: string) => simpleUserPost(runUserAction, email, "block"),
    unblockUser: (email: string) =>
      simpleUserPost(runUserAction, email, "unblock"),
    assignOffice: (email: string) => assignOffice(runUserAction, email, drafts),
    saveDisplayName: (email: string) =>
      saveDisplayName(runUserAction, email, drafts),
    saveEmail: (email: string) => saveEmail(runUserAction, email, drafts),
    deleteUser: (email: string) => deleteUser(runUserAction, email, confirm),
    dialog,
  };
}

export default function Administration() {
  const admin = useAdminConfig();
  const approvalActions = useApprovalActions(
    admin.drafts.selectedApprovalOffices,
    admin.refreshConfig,
    admin.setError,
  );
  const localUser = useLocalUserActions(
    admin.refreshConfig,
    admin.setError,
    admin.newLocalUserOfficeLocationId,
  );
  const officeActions = useOfficeActions(
    admin.drafts,
    admin.refreshConfig,
    admin.setError,
  );
  const userActions = useUserActions(
    admin.drafts,
    admin.refreshConfig,
    admin.setError,
  );

  if (admin.loading) return <LoadingView />;
  if (admin.error && !admin.config) return <ErrorView error={admin.error} />;
  if (!admin.config?.isAdmin) return <AccessDeniedView />;

  return (
    <div className="w-full p-6">
      <AdminHeader error={admin.error} />
      <div className="space-y-4">
        <RecommenderAdminPanel officeLocations={admin.config.officeLocations} />
        <PendingApprovalsSection
          config={admin.config}
          drafts={admin.drafts}
          actions={approvalActions}
        />
        <LocalUserSection
          config={admin.config}
          officeLocationId={admin.newLocalUserOfficeLocationId}
          setOfficeLocationId={admin.setNewLocalUserOfficeLocationId}
          localUser={localUser}
        />
        <OfficeLocationsSection
          config={admin.config}
          drafts={admin.drafts}
          actions={officeActions}
        />
        <UsersSection
          config={admin.config}
          drafts={admin.drafts}
          actions={userActions}
        />
        {userActions.dialog}
      </div>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">
      Loading...
    </div>
  );
}

function ErrorView({ error }: { error: string }) {
  return (
    <div className="w-full p-6">
      <div className="rounded border border-danger bg-danger-soft p-4 text-sm text-danger-fg">
        {error}
      </div>
    </div>
  );
}

function AccessDeniedView() {
  return (
    <div className="w-full p-6">
      <div className="rounded border border-danger bg-danger-soft p-4 text-sm text-danger-fg">
        <p>Access denied.</p>
        <Link to="/" className="mt-2 inline-block text-accent hover:underline">
          Back to home
        </Link>
      </div>
    </div>
  );
}

function AdminHeader({ error }: { error: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-fg">Administration</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Approve access requests and manage users and offices.
      </p>
      {error && (
        <div className="mt-3 rounded border border-danger bg-danger-soft p-3 text-sm text-danger-fg">
          {error}
        </div>
      )}
    </div>
  );
}

function PendingApprovalsSection({
  config,
  drafts,
  actions,
}: {
  config: AdminAuth;
  drafts: Pick<
    AdminDrafts,
    "selectedApprovalOffices" | "setSelectedApprovalOffices"
  >;
  actions: ReturnType<typeof useApprovalActions>;
}) {
  return (
    <div className="rounded border border-border bg-surface-muted p-4">
      <h2 className="mb-3 text-sm font-semibold text-fg">Pending approvals</h2>
      {config.pendingApprovals.length === 0 ? (
        <p className="text-sm text-fg-muted">No pending users.</p>
      ) : (
        <ul className="space-y-2">
          {config.pendingApprovals.map((entry) => (
            <li
              key={entry.email}
              className="rounded border border-border bg-surface px-3 py-2 text-sm"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <span className="text-fg">{entry.email}</span>
                <ApprovalControls
                  email={entry.email}
                  officeLocations={config.officeLocations}
                  selectedOfficeId={
                    drafts.selectedApprovalOffices[entry.email] ?? ""
                  }
                  setSelectedApprovalOffices={drafts.setSelectedApprovalOffices}
                  actions={actions}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ApprovalControls({
  email,
  officeLocations,
  selectedOfficeId,
  setSelectedApprovalOffices,
  actions,
}: {
  email: string;
  officeLocations: OfficeLocation[];
  selectedOfficeId: string;
  setSelectedApprovalOffices: Dispatch<SetStateAction<Record<string, string>>>;
  actions: ReturnType<typeof useApprovalActions>;
}) {
  const updating = actions.updatingApprovalEmail === email;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selectedOfficeId}
        onChange={(event) =>
          setSelectedApprovalOffices((current) => ({
            ...current,
            [email]: event.target.value,
          }))
        }
        className="rounded border border-border bg-surface px-2 py-1 text-xs text-fg"
      >
        <option value="">Select office</option>
        {officeLocations
          .filter((location) => location.isActive)
          .map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
      </select>
      <button
        type="button"
        disabled={updating || !selectedOfficeId}
        onClick={() => void actions.approveUser(email)}
        className="rounded bg-success-solid px-3 py-1 text-xs font-medium text-success-on transition-colors hover:opacity-90 disabled:opacity-60"
      >
        {updating ? "Updating..." : "Approve"}
      </button>
      <button
        type="button"
        disabled={updating}
        onClick={() => void actions.declineUser(email)}
        className="rounded bg-danger-solid px-3 py-1 text-xs font-medium text-danger-on transition-colors hover:opacity-90 disabled:opacity-60"
      >
        {updating ? "Updating..." : "Decline"}
      </button>
    </div>
  );
}

function LocalUserSection({
  config,
  officeLocationId,
  setOfficeLocationId,
  localUser,
}: {
  config: AdminAuth;
  officeLocationId: string;
  setOfficeLocationId: (value: string) => void;
  localUser: ReturnType<typeof useLocalUserActions>;
}) {
  return (
    <div className="rounded border border-border bg-surface-muted p-4">
      <h2 className="mb-3 text-sm font-semibold text-fg">Create local user</h2>
      <form
        onSubmit={(event) => void localUser.createLocalUser(event)}
        className="space-y-3"
      >
        <input
          type="email"
          value={localUser.newLocalUserEmail}
          onChange={(event) =>
            localUser.setNewLocalUserEmail(event.target.value)
          }
          placeholder="Email"
          required
          className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
        />
        <OfficeSelect
          officeLocations={config.officeLocations}
          value={officeLocationId}
          onChange={setOfficeLocationId}
          label="Office location for new local user"
        />
        <input
          type="text"
          value={localUser.newLocalUserPassword}
          onChange={(event) =>
            localUser.setNewLocalUserPassword(event.target.value)
          }
          placeholder="Password (leave empty to auto-generate)"
          aria-invalid={!!localUser.passwordValidationError}
          className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
        />
        {localUser.passwordValidationError && (
          <p className="text-xs text-danger-fg">
            {localUser.passwordValidationError}
          </p>
        )}
        <button
          type="submit"
          disabled={
            localUser.creatingLocalUser ||
            !!localUser.passwordValidationError ||
            !officeLocationId
          }
          className="w-full rounded bg-accent-solid px-4 py-2 text-sm font-medium text-accent-on transition-colors hover:opacity-90 disabled:opacity-60"
        >
          {localUser.creatingLocalUser ? "Creating..." : "Create local user"}
        </button>
      </form>
      {localUser.createdLocalUser && (
        <CreatedLocalUserNotice user={localUser.createdLocalUser} />
      )}
    </div>
  );
}

function CreatedLocalUserNotice({
  user,
}: {
  user: { email: string; password: string; generated: boolean };
}) {
  return (
    <div className="mt-3 rounded border border-accent/40 bg-accent-soft/40 p-3 text-sm text-accent-fg">
      <div className="font-medium">Credentials created for {user.email}</div>
      <div className="mt-1 break-all">
        Temporary password: <code>{user.password}</code>
      </div>
      {user.generated && (
        <div className="mt-1 text-xs text-accent-fg">
          Password was auto-generated. Share it securely once.
        </div>
      )}
    </div>
  );
}

function OfficeSelect({
  officeLocations,
  value,
  onChange,
  label,
  enabledOnly = true,
}: {
  officeLocations: OfficeLocation[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  enabledOnly?: boolean;
}) {
  const locations = enabledOnly
    ? officeLocations.filter((location) => location.isActive)
    : officeLocations;
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
    >
      <option value="">Select office location</option>
      {locations.map((location) => (
        <option key={location.id} value={location.id}>
          {location.name}
        </option>
      ))}
    </select>
  );
}

function OfficeLocationsSection({
  config,
  drafts,
  actions,
}: {
  config: AdminAuth;
  drafts: Pick<
    AdminDrafts,
    | "officeNameDrafts"
    | "setOfficeNameDrafts"
    | "officeSettingsDrafts"
    | "setOfficeSettingsDrafts"
  >;
  actions: ReturnType<typeof useOfficeActions>;
}) {
  return (
    <div className="rounded border border-border bg-surface-muted p-4">
      <h2 className="mb-3 text-sm font-semibold text-fg">Office locations</h2>
      <form
        onSubmit={(event) => void actions.createOffice(event)}
        className="mb-3 flex gap-2"
      >
        <input
          type="text"
          value={actions.newOfficeName}
          onChange={(event) => actions.setNewOfficeName(event.target.value)}
          placeholder="New office location"
          className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={actions.creatingOffice || !actions.newOfficeName.trim()}
          className="rounded bg-accent-solid px-4 py-2 text-sm font-medium text-accent-on transition-colors hover:opacity-90 disabled:opacity-60"
        >
          {actions.creatingOffice ? "Creating..." : "Add office"}
        </button>
      </form>
      <ul className="space-y-2">
        {config.officeLocations.map((location) => (
          <OfficeLocationRow
            key={location.id}
            location={location}
            drafts={drafts}
            actions={actions}
          />
        ))}
      </ul>
    </div>
  );
}

function OfficeLocationRow({
  location,
  drafts,
  actions,
}: {
  location: OfficeLocation;
  drafts: Pick<
    AdminDrafts,
    | "officeNameDrafts"
    | "setOfficeNameDrafts"
    | "officeSettingsDrafts"
    | "setOfficeSettingsDrafts"
  >;
  actions: ReturnType<typeof useOfficeActions>;
}) {
  const settingsDraft =
    drafts.officeSettingsDrafts[location.id] ?? initialOfficeSettings(location);
  const updating = actions.updatingOfficeId === location.id;
  const changed = settingsChanged(location, settingsDraft);

  return (
    <li className="rounded border border-border bg-surface px-3 py-3 text-sm">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <p className="font-medium text-fg">{location.name}</p>
          <p className="text-xs text-fg-muted">
            Key: {location.key} · {location.isActive ? "Active" : "Inactive"}
          </p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            type="text"
            aria-label={`Office name for ${location.key}`}
            value={drafts.officeNameDrafts[location.id] ?? ""}
            onChange={(event) =>
              drafts.setOfficeNameDrafts((current) => ({
                ...current,
                [location.id]: event.target.value,
              }))
            }
            className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
          />
          <OfficeRowActions
            location={location}
            updating={updating}
            drafts={drafts}
            actions={actions}
          />
        </div>
        <OfficeSettingsEditor
          location={location}
          settingsDraft={settingsDraft}
          updating={updating}
          changed={changed}
          setOfficeSettingsDrafts={drafts.setOfficeSettingsDrafts}
          onSave={() => void actions.updateOfficeSettings(location.id)}
        />
      </div>
    </li>
  );
}

function OfficeRowActions({
  location,
  updating,
  drafts,
  actions,
}: {
  location: OfficeLocation;
  updating: boolean;
  drafts: Pick<AdminDrafts, "officeNameDrafts">;
  actions: ReturnType<typeof useOfficeActions>;
}) {
  const draftName = drafts.officeNameDrafts[location.id]?.trim();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        aria-label={`Rename office ${location.key}`}
        disabled={updating || !draftName || draftName === location.name}
        onClick={() => void actions.renameOffice(location.id)}
        className="rounded border border-border bg-surface-muted px-3 py-2 text-xs font-medium text-fg hover:bg-surface disabled:opacity-60"
      >
        {updating ? "Updating..." : "Rename"}
      </button>
      <button
        type="button"
        aria-label={`Deactivate office ${location.key}`}
        disabled={updating || !location.isActive || location.key === "default"}
        onClick={() => void actions.deactivateOffice(location.id)}
        className="rounded border border-danger bg-danger-soft px-3 py-2 text-xs font-medium text-danger-fg hover:bg-danger-soft disabled:opacity-60"
      >
        {updating ? "Updating..." : "Deactivate"}
      </button>
    </div>
  );
}

function OfficeSettingsEditor({
  location,
  settingsDraft,
  updating,
  changed,
  setOfficeSettingsDrafts,
  onSave,
}: {
  location: OfficeLocation;
  settingsDraft: OfficeSettingsDraft;
  updating: boolean;
  changed: boolean;
  setOfficeSettingsDrafts: Dispatch<
    SetStateAction<Record<string, OfficeSettingsDraft>>
  >;
  onSave: () => void;
}) {
  const patchDraft = (patch: Partial<OfficeSettingsDraft>) =>
    setOfficeSettingsDrafts((current) => ({
      ...current,
      [location.id]: { ...(current[location.id] ?? settingsDraft), ...patch },
    }));

  return (
    <div className="rounded border border-border bg-surface-muted p-3">
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-fg">
          <input
            type="checkbox"
            aria-label={`Enable scheduled poll for ${location.key}`}
            checked={settingsDraft.autoStartPollEnabled}
            disabled={updating || !location.isActive}
            onChange={(event) =>
              patchDraft({ autoStartPollEnabled: event.target.checked })
            }
          />
          Auto-start lunch poll
        </label>
        <div className="grid gap-3 lg:grid-cols-2">
          <WeekdaySelector
            location={location}
            settingsDraft={settingsDraft}
            updating={updating}
            setOfficeSettingsDrafts={setOfficeSettingsDrafts}
          />
          <label className="text-sm text-fg">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Poll should finish by
            </span>
            <input
              type="time"
              aria-label={`Auto-start finish time for ${location.key}`}
              value={settingsDraft.autoStartPollFinishTime}
              disabled={
                updating ||
                !location.isActive ||
                !settingsDraft.autoStartPollEnabled
              }
              onChange={(event) =>
                patchDraft({ autoStartPollFinishTime: event.target.value })
              }
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none disabled:bg-surface-muted"
            />
          </label>
        </div>
        <FoodDurationSelect
          location={location}
          settingsDraft={settingsDraft}
          updating={updating}
          patchDraft={patchDraft}
        />
        <div className="flex justify-end">
          <button
            type="button"
            aria-label={`Save office settings for ${location.key}`}
            disabled={updating || !location.isActive || !changed}
            onClick={onSave}
            className="rounded border border-success bg-success-soft px-3 py-2 text-xs font-medium text-success-fg hover:bg-success-soft disabled:opacity-60"
          >
            {updating ? "Updating..." : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WeekdaySelector({
  location,
  settingsDraft,
  updating,
  setOfficeSettingsDrafts,
}: {
  location: OfficeLocation;
  settingsDraft: OfficeSettingsDraft;
  updating: boolean;
  setOfficeSettingsDrafts: Dispatch<
    SetStateAction<Record<string, OfficeSettingsDraft>>
  >;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Weekdays
      </p>
      <div className="flex flex-wrap gap-2">
        {OFFICE_WEEKDAY_OPTIONS.map((weekday) => {
          const checked = settingsDraft.autoStartPollWeekdays.includes(
            weekday.value,
          );
          return (
            <label
              key={weekday.value}
              className="flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-xs text-fg"
            >
              <input
                type="checkbox"
                aria-label={`${weekday.label} auto poll for ${location.key}`}
                checked={checked}
                disabled={
                  updating ||
                  !location.isActive ||
                  !settingsDraft.autoStartPollEnabled
                }
                onChange={(event) =>
                  setOfficeSettingsDrafts((current) => {
                    const currentDraft = current[location.id] ?? settingsDraft;
                    const nextWeekdays = orderWeekdays(
                      event.target.checked
                        ? [...currentDraft.autoStartPollWeekdays, weekday.value]
                        : currentDraft.autoStartPollWeekdays.filter(
                            (value) => value !== weekday.value,
                          ),
                    );
                    return {
                      ...current,
                      [location.id]: {
                        ...currentDraft,
                        autoStartPollWeekdays: nextWeekdays,
                      },
                    };
                  })
                }
              />
              <span>{weekday.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function FoodDurationSelect({
  location,
  settingsDraft,
  updating,
  patchDraft,
}: {
  location: OfficeLocation;
  settingsDraft: OfficeSettingsDraft;
  updating: boolean;
  patchDraft: (patch: Partial<OfficeSettingsDraft>) => void;
}) {
  return (
    <label className="text-sm text-fg">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Default food-selection duration
      </span>
      <select
        aria-label={`Default food selection duration for ${location.key}`}
        value={settingsDraft.defaultFoodSelectionDurationMinutes}
        disabled={updating}
        onChange={(event) =>
          patchDraft({
            defaultFoodSelectionDurationMinutes: Number(event.target.value),
          })
        }
        className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
      >
        {FOOD_DURATIONS.map((duration) => (
          <option key={duration} value={duration}>
            {duration} min
          </option>
        ))}
      </select>
    </label>
  );
}

function UsersSection({
  config,
  drafts,
  actions,
}: {
  config: AdminAuth;
  drafts: Pick<
    AdminDrafts,
    | "selectedUserOffices"
    | "setSelectedUserOffices"
    | "selectedUserOfficeMemberships"
    | "setSelectedUserOfficeMemberships"
    | "displayNameDrafts"
    | "setDisplayNameDrafts"
    | "emailDrafts"
    | "setEmailDrafts"
  >;
  actions: ReturnType<typeof useUserActions>;
}) {
  return (
    <div className="rounded border border-border bg-surface-muted p-4">
      <h2 className="mb-3 text-sm font-semibold text-fg">Users</h2>
      {config.users.length === 0 ? (
        <p className="text-sm text-fg-muted">No users yet.</p>
      ) : (
        <ul className="space-y-2">
          {config.users.map((entry) => (
            <UserRow
              key={entry.email}
              entry={entry}
              config={config}
              drafts={drafts}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function UserRow({
  entry,
  config,
  drafts,
  actions,
}: {
  entry: AdminUser;
  config: AdminAuth;
  drafts: Pick<
    AdminDrafts,
    | "selectedUserOffices"
    | "setSelectedUserOffices"
    | "selectedUserOfficeMemberships"
    | "setSelectedUserOfficeMemberships"
    | "displayNameDrafts"
    | "setDisplayNameDrafts"
    | "emailDrafts"
    | "setEmailDrafts"
  >;
  actions: ReturnType<typeof useUserActions>;
}) {
  const isCurrentUser = config.user?.username === entry.email;
  const canManageLocalAccount =
    entry.localAccount &&
    !entry.protectedBootstrapAdmin &&
    entry.displayNameSource !== "entra";
  const canEditDisplayName =
    entry.localAccount && entry.displayNameSource !== "entra";

  return (
    <li className="rounded border border-border bg-surface px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <UserSummary entry={entry} />
        <div className="flex max-w-xl flex-col gap-2">
          <AccountEmailEditor
            entry={entry}
            drafts={drafts}
            actions={actions}
            canManageLocalAccount={canManageLocalAccount}
          />
          {!entry.localAccount ? (
            <p className="text-xs text-fg-muted">
              External account email is read-only
            </p>
          ) : null}
          <DisplayNameEditor
            entry={entry}
            drafts={drafts}
            actions={actions}
            canEditDisplayName={canEditDisplayName}
          />
          {entry.displayNameSource === "entra" ? (
            <p className="text-xs text-fg-muted">Managed by Microsoft Entra</p>
          ) : null}
          <OfficeMembershipEditor
            entry={entry}
            config={config}
            drafts={drafts}
            actions={actions}
          />
          <UserRoleActions
            entry={entry}
            isCurrentUser={isCurrentUser}
            canManageLocalAccount={canManageLocalAccount}
            actions={actions}
          />
        </div>
      </div>
    </li>
  );
}

function UserSummary({ entry }: { entry: AdminUser }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-fg">{entry.email}</p>
      <p className="text-xs text-fg-muted">
        {entry.blocked ? "Blocked" : entry.approved ? "Approved" : "Pending"} ·{" "}
        {entry.isAdmin ? "Admin" : "User"}
      </p>
      <p className="text-xs text-fg-muted">
        Preferred office: {entry.officeLocationName ?? "Unassigned"}
      </p>
      <p className="text-xs text-fg-muted">
        Assigned offices:{" "}
        {entry.assignedOfficeLocations.length > 0
          ? entry.assignedOfficeLocations
              .map((location) => location.name)
              .join(", ")
          : "None"}
      </p>
      <p className="text-xs text-fg-muted">
        Display name: {entry.displayName || "Email fallback"}
      </p>
    </div>
  );
}

function AccountEmailEditor({
  entry,
  drafts,
  actions,
  canManageLocalAccount,
}: {
  entry: AdminUser;
  drafts: Pick<AdminDrafts, "emailDrafts" | "setEmailDrafts">;
  actions: ReturnType<typeof useUserActions>;
  canManageLocalAccount: boolean;
}) {
  const updating = actions.updatingUserRoleEmail === entry.email;
  const unchanged =
    (drafts.emailDrafts[entry.email] ?? entry.email).trim().toLowerCase() ===
    entry.email.toLowerCase();
  return (
    <div className="flex flex-col gap-1 sm:flex-row">
      <input
        type="email"
        aria-label={`Account email for ${entry.email}`}
        value={drafts.emailDrafts[entry.email] ?? entry.email}
        disabled={!canManageLocalAccount || updating}
        onChange={(event) =>
          drafts.setEmailDrafts((current) => ({
            ...current,
            [entry.email]: event.target.value,
          }))
        }
        className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-fg disabled:bg-surface-muted disabled:text-fg-muted"
      />
      <button
        type="button"
        disabled={!canManageLocalAccount || updating || unchanged}
        onClick={() => void actions.saveEmail(entry.email)}
        className="rounded border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-fg hover:bg-surface disabled:opacity-60"
      >
        {updating ? "Updating..." : "Save email"}
      </button>
    </div>
  );
}

function DisplayNameEditor({
  entry,
  drafts,
  actions,
  canEditDisplayName,
}: {
  entry: AdminUser;
  drafts: Pick<AdminDrafts, "displayNameDrafts" | "setDisplayNameDrafts">;
  actions: ReturnType<typeof useUserActions>;
  canEditDisplayName: boolean;
}) {
  const updating = actions.updatingUserRoleEmail === entry.email;
  const unchanged =
    (drafts.displayNameDrafts[entry.email] ?? "").trim() ===
    (entry.displayName ?? "");
  return (
    <div className="flex flex-col gap-1 sm:flex-row">
      <input
        type="text"
        aria-label={`Display name for ${entry.email}`}
        value={drafts.displayNameDrafts[entry.email] ?? ""}
        disabled={!canEditDisplayName || updating}
        onChange={(event) =>
          drafts.setDisplayNameDrafts((current) => ({
            ...current,
            [entry.email]: event.target.value,
          }))
        }
        className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-fg disabled:bg-surface-muted disabled:text-fg-muted"
        placeholder="Display name"
      />
      <button
        type="button"
        disabled={!canEditDisplayName || updating || unchanged}
        onClick={() => void actions.saveDisplayName(entry.email)}
        className="rounded border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-fg hover:bg-surface disabled:opacity-60"
      >
        {updating ? "Updating..." : "Save name"}
      </button>
    </div>
  );
}

function OfficeMembershipEditor({
  entry,
  config,
  drafts,
  actions,
}: {
  entry: AdminUser;
  config: AdminAuth;
  drafts: Pick<
    AdminDrafts,
    | "selectedUserOffices"
    | "setSelectedUserOffices"
    | "selectedUserOfficeMemberships"
    | "setSelectedUserOfficeMemberships"
  >;
  actions: ReturnType<typeof useUserActions>;
}) {
  const memberships = drafts.selectedUserOfficeMemberships[entry.email] ?? [];
  const officesUnchanged =
    memberships.join("|") === entry.assignedOfficeLocationIds.join("|") &&
    (drafts.selectedUserOffices[entry.email] ?? "") ===
      (entry.officeLocationId ?? "");
  const updating = actions.updatingUserRoleEmail === entry.email;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {config.officeLocations
          .filter((location) => location.isActive)
          .map((location) => (
            <OfficeMembershipCheckbox
              key={location.id}
              entry={entry}
              location={location}
              checked={memberships.includes(location.id)}
              disabled={updating}
              drafts={drafts}
            />
          ))}
      </div>
      <select
        aria-label={`Preferred office for ${entry.email}`}
        value={drafts.selectedUserOffices[entry.email] ?? ""}
        onChange={(event) =>
          drafts.setSelectedUserOffices((current) => ({
            ...current,
            [entry.email]: event.target.value,
          }))
        }
        disabled={updating || memberships.length === 0}
        className="rounded border border-border bg-surface px-2 py-1 text-xs text-fg"
      >
        <option value="">Select preferred office</option>
        {config.officeLocations
          .filter((location) => memberships.includes(location.id))
          .map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
      </select>
      <button
        type="button"
        disabled={
          updating ||
          (memberships.length === 0 && !entry.isAdmin) ||
          officesUnchanged
        }
        onClick={() => void actions.assignOffice(entry.email)}
        className="rounded border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-fg hover:bg-surface disabled:opacity-60"
      >
        {updating ? "Updating..." : "Save offices"}
      </button>
    </>
  );
}

function OfficeMembershipCheckbox({
  entry,
  location,
  checked,
  disabled,
  drafts,
}: {
  entry: AdminUser;
  location: OfficeLocation;
  checked: boolean;
  disabled: boolean;
  drafts: Pick<
    AdminDrafts,
    "setSelectedUserOffices" | "setSelectedUserOfficeMemberships"
  >;
}) {
  return (
    <label className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-fg">
      <input
        type="checkbox"
        aria-label={`${location.name} membership for ${entry.email}`}
        checked={checked}
        disabled={disabled}
        onChange={(event) =>
          drafts.setSelectedUserOfficeMemberships((current) => {
            const currentMemberships = current[entry.email] ?? [];
            const nextMemberships = event.target.checked
              ? [...currentMemberships, location.id]
              : currentMemberships.filter((id) => id !== location.id);
            updatePreferredOffice(
              entry.email,
              location.id,
              event.target.checked,
              nextMemberships,
              drafts,
            );
            return { ...current, [entry.email]: nextMemberships };
          })
        }
      />
      <span>{location.name}</span>
    </label>
  );
}

function updatePreferredOffice(
  email: string,
  locationId: string,
  checked: boolean,
  nextMemberships: string[],
  drafts: Pick<AdminDrafts, "setSelectedUserOffices">,
) {
  drafts.setSelectedUserOffices((currentPreferred) => {
    const currentOffice = currentPreferred[email];
    if (checked) {
      return { ...currentPreferred, [email]: currentOffice || locationId };
    }
    if (currentOffice === locationId) {
      return { ...currentPreferred, [email]: nextMemberships[0] ?? "" };
    }
    return currentPreferred;
  });
}

function UserRoleActions({
  entry,
  isCurrentUser,
  canManageLocalAccount,
  actions,
}: {
  entry: AdminUser;
  isCurrentUser: boolean;
  canManageLocalAccount: boolean;
  actions: ReturnType<typeof useUserActions>;
}) {
  const updating = actions.updatingUserRoleEmail === entry.email;
  return (
    <div className="flex flex-wrap gap-2">
      {entry.isAdmin ? (
        <button
          type="button"
          disabled={updating || isCurrentUser || entry.blocked}
          onClick={() => void actions.demoteUser(entry.email)}
          className="rounded border border-warning bg-warning-soft px-3 py-1 text-xs font-medium text-warning-fg hover:bg-warning-soft disabled:opacity-60"
        >
          {updating ? "Updating..." : "Demote"}
        </button>
      ) : (
        <button
          type="button"
          disabled={updating || entry.blocked}
          onClick={() => void actions.promoteUser(entry.email)}
          className="rounded bg-accent-solid px-3 py-1 text-xs font-medium text-accent-on transition-colors hover:opacity-90 disabled:opacity-60"
        >
          {updating ? "Updating..." : "Promote"}
        </button>
      )}
      <BlockToggle
        entry={entry}
        isCurrentUser={isCurrentUser}
        updating={updating}
        actions={actions}
      />
      <button
        type="button"
        disabled={!canManageLocalAccount || updating || isCurrentUser}
        onClick={() => void actions.deleteUser(entry.email)}
        className="rounded border border-danger bg-danger-soft px-3 py-1 text-xs font-medium text-danger-fg hover:bg-danger-soft disabled:opacity-60"
      >
        {updating ? "Updating..." : "Delete local account"}
      </button>
    </div>
  );
}

function BlockToggle({
  entry,
  isCurrentUser,
  updating,
  actions,
}: {
  entry: AdminUser;
  isCurrentUser: boolean;
  updating: boolean;
  actions: ReturnType<typeof useUserActions>;
}) {
  if (entry.blocked) {
    return (
      <button
        type="button"
        disabled={updating}
        onClick={() => void actions.unblockUser(entry.email)}
        className="rounded border border-success bg-success-soft px-3 py-1 text-xs font-medium text-success-fg hover:bg-success-soft disabled:opacity-60"
      >
        {updating ? "Updating..." : "Unblock"}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={updating || isCurrentUser}
      onClick={() => void actions.blockUser(entry.email)}
      className="rounded bg-danger-solid px-3 py-1 text-xs font-medium text-danger-on transition-colors hover:opacity-90 disabled:opacity-60"
    >
      {updating ? "Updating..." : "Block"}
    </button>
  );
}
