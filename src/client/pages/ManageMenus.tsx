import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useAppState } from '../context/AppContext.js';
import { getAuthenticatedDisplayLabel } from '../auth.js';
import * as api from '../api.js';
import menuImportJsonSchema from '../../../import/menu/import-menu-schema.json';
import type {
  Menu,
  ImportMenuPreviewResponse,
  ImportMenuViolation,
  UserMenuDefaultPreference,
} from '../../lib/types.js';

const MENU_IMPORT_JSON_SCHEMA = menuImportJsonSchema;

const MENU_IMPORT_SCHEMA_TEXT = JSON.stringify(MENU_IMPORT_JSON_SCHEMA, null, 2);
const MENU_IMPORT_LLM_PROMPT = [
  'You extract a Team Lunch menu import JSON from unstructured menu text.',
  'Return JSON only. Do not include markdown, explanations, or comments.',
  'Follow this exact schema and field names:',
  MENU_IMPORT_SCHEMA_TEXT,
  'Hard validation rules:',
  '- Root object must be { "menu": [...] } with at least 2 entries.',
  '- menu[0] is metadata and must include "name" and "date-created" (ISO datetime).',
  '- menu[1..] are category sections with an "items" array.',
  '- Every item needs "name", "ingredients", "price"; optional "item-number" is allowed.',
  '- item-number, if provided, must be a string with max 40 characters.',
  '- price must be a number between 0 and 9999.99 with max 2 decimal places.',
  '- Item names must be unique across all sections (case-insensitive).',
  '- Keep side dishes and drinks as menu items when present; make their item name/category clear (for example "Garlic Naan", "Mango Lassi", or a "Drinks" section) so the app can tag them as course:side or course:drink after import.',
  '- If a value is unknown, use empty string for optional strings or omit optional fields.',
  'Output only one JSON object, no surrounding text.',
].join('\n');

function formatPrice(value: number | null): string {
  return value === null ? '-' : `€${value.toFixed(2)}`;
}

function parseItemPriceInput(value: string): { value: number | null; error: string | null } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null, error: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: 'Price must be a finite number' };
  }
  if (parsed < 0 || parsed > 9999.99) {
    return { value: null, error: 'Price must be between 0 and 9999.99' };
  }

  const decimals = trimmed.includes('.') ? trimmed.split('.')[1]?.length ?? 0 : 0;
  if (decimals > 2) {
    return { value: null, error: 'Price must have at most 2 decimal places' };
  }

  return { value: parsed, error: null };
}

function normalizeMenuContactInput(value: string, maxLength: number): { value: string | null; error: string | null } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null, error: null };
  }
  if (trimmed.length > maxLength) {
    return { value: null, error: `Must be at most ${maxLength} characters` };
  }
  return { value: trimmed, error: null };
}

function parseMenuUrlInput(value: string): { value: string | null; error: string | null } {
  const normalized = normalizeMenuContactInput(value, 255);
  if (normalized.error || !normalized.value) {
    return normalized;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized.value);
  } catch {
    return { value: null, error: 'URL must be a valid absolute URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { value: null, error: 'URL must use http or https' };
  }
  return normalized;
}

// ─── Confirmation dialog ────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-lg bg-surface-raised p-6 shadow-xl">
        <p className="mb-4 text-fg">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm text-fg-muted hover:bg-surface-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-danger-solid px-4 py-2 text-sm font-medium text-danger-on transition-colors hover:opacity-90"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuEditDialog({
  menuName,
  name,
  location,
  phone,
  url,
  orderUrl,
  error,
  submitting,
  onNameChange,
  onLocationChange,
  onPhoneChange,
  onUrlChange,
  onOrderUrlChange,
  onSave,
  onCancel,
}: {
  menuName: string;
  name: string;
  location: string;
  phone: string;
  url: string;
  orderUrl: string;
  error: string;
  submitting: boolean;
  onNameChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onOrderUrlChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-surface-raised p-6 shadow-xl">
        <h4 className="text-base font-semibold text-fg">Edit menu {menuName}</h4>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="menu-edit-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Name
            </label>
            <input
              id="menu-edit-name"
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={60}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              placeholder="Menu name"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="menu-contact-location" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Location
            </label>
            <input
              id="menu-contact-location"
              type="text"
              value={location}
              onChange={(event) => onLocationChange(event.target.value)}
              maxLength={160}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              placeholder="Street or office location"
            />
          </div>
          <div>
            <label htmlFor="menu-contact-phone" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Phone
            </label>
            <input
              id="menu-contact-phone"
              type="text"
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value)}
              maxLength={40}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              placeholder="Phone number"
            />
          </div>
          <div>
            <label htmlFor="menu-contact-url" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-muted">
              URL
            </label>
            <input
              id="menu-contact-url"
              type="url"
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              maxLength={255}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              placeholder="https://example.com"
            />
          </div>
          <div>
            <label htmlFor="menu-contact-order-url" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Order URL
            </label>
            <input
              id="menu-contact-order-url"
              type="url"
              value={orderUrl}
              onChange={(event) => onOrderUrlChange(event.target.value)}
              maxLength={255}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              placeholder="https://delivery-service.com/order"
            />
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-danger-fg">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm text-fg-muted hover:bg-surface-muted"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded bg-accent-solid px-4 py-2 text-sm font-medium text-accent-on transition-colors hover:opacity-90 disabled:opacity-50"
            disabled={submitting}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Menu Item Row ──────────────────────────────────────────

function MenuItemRow({
  item,
  menuId,
}: {
  item: Menu['items'][number];
  menuId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [itemNumber, setItemNumber] = useState(item.itemNumber ?? '');
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? '');
  const [price, setPrice] = useState(item.price === null ? '' : item.price.toFixed(2));
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    const trimmedItemNumber = itemNumber.trim();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Item name cannot be empty');
      return;
    }
    if (trimmed.length > 80) {
      setError('Item name must be 80 characters or fewer');
      return;
    }
    if (trimmedItemNumber.length > 40) {
      setError('Item number must be 40 characters or fewer');
      return;
    }
    const parsedPrice = parseItemPriceInput(price);
    if (parsedPrice.error) {
      setError(parsedPrice.error);
      return;
    }
    setSubmitting(true);
    try {
      await api.updateMenuItem(menuId, item.id, {
        name: trimmed,
        description: description.trim() || undefined,
        itemNumber: trimmedItemNumber || null,
        price: parsedPrice.value,
      });
      setEditing(false);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await api.deleteMenuItem(menuId, item.id);
      setConfirmDelete(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (editing) {
    return (
      <div className="rounded border border-accent/40 bg-accent-soft/40 p-3">
        <div className="space-y-2">
          <input
            type="text"
            value={itemNumber}
            onChange={(e) => { setItemNumber(e.target.value); setError(''); }}
            maxLength={40}
            className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
            placeholder="Meal number (optional)"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            maxLength={80}
            className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
            placeholder="Item name"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
            placeholder="Description (optional)"
          />
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="9999.99"
            value={price}
            onChange={(e) => { setPrice(e.target.value); setError(''); }}
            className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
            placeholder="Price (optional)"
          />
          {error && <p className="text-sm text-danger-fg">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={submitting}
              className="w-full rounded bg-accent-solid px-3 py-2 text-xs font-medium text-accent-on transition-colors hover:opacity-90 disabled:opacity-50 sm:w-auto sm:py-1"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setItemNumber(item.itemNumber ?? '');
                setName(item.name);
                setDescription(item.description ?? '');
                setPrice(item.price === null ? '' : item.price.toFixed(2));
                setError('');
              }}
              className="w-full rounded px-3 py-2 text-xs text-fg-muted hover:bg-surface-muted sm:w-auto sm:py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-2 rounded px-3 py-2 hover:bg-surface-muted sm:grid-cols-[max-content_minmax(0,1fr)_minmax(0,4fr)_max-content_max-content_max-content] sm:items-start">
        <p className="inline-flex w-fit rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-fg-muted sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0 sm:text-sm sm:font-medium sm:normal-case sm:tracking-normal">{item.itemNumber ?? '-'}</p>
        <p className="whitespace-normal break-words text-sm font-medium text-fg sm:truncate">{item.name}</p>
        <p className="whitespace-normal break-words text-left text-sm text-fg-muted">{item.description ?? '-'}</p>
        <p className="text-sm font-medium text-success-fg sm:whitespace-nowrap">{formatPrice(item.price)}</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit"
          title="Edit"
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded p-1.5 text-accent hover:bg-surface-muted sm:justify-self-center sm:min-h-0 sm:min-w-0 sm:whitespace-nowrap"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
          <span className="sr-only">Edit</span>
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete"
          title="Delete"
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded p-1.5 text-danger-fg hover:bg-surface-muted sm:justify-self-center sm:min-h-0 sm:min-w-0 sm:whitespace-nowrap"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          <span className="sr-only">Delete</span>
        </button>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete item "${item.name}"?`}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

// ─── Import Menu Form ──────────────────────────────────────

function ImportMenuPanel({ onClose }: { onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [violations, setViolations] = useState<ImportMenuViolation[]>([]);
  const [pendingPayload, setPendingPayload] = useState<unknown | null>(null);
  const [preview, setPreview] = useState<ImportMenuPreviewResponse | null>(null);
  const [jsonTextInput, setJsonTextInput] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const previewRequestIdRef = useRef(0);

  const readFileText = async (file: File): Promise<string> => {
    if (typeof file.text === 'function') {
      return file.text();
    }

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await readFileText(file);
      setJsonTextInput(text);
    } catch {
      setError('Failed to read file');
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const triggerJsonTextPreview = useCallback(async (text: string, requestId: number) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('');
      setSuccess('');
      setViolations([]);
      setPreview(null);
      setPendingPayload(null);
      return;
    }

    try {
      const payload = JSON.parse(trimmed) as unknown;
      setSubmitting(true);
      setError('');
      setSuccess('');
      setViolations([]);
      const previewResult = await api.previewImportMenuJson(payload);
      if (previewRequestIdRef.current !== requestId) return;
      setPendingPayload(payload);
      setPreview(previewResult);
    } catch (err) {
      if (previewRequestIdRef.current !== requestId) return;
      if (err instanceof SyntaxError) {
        setError('Pasted content is not valid JSON');
        setSuccess('');
        setViolations([]);
      } else {
        const importError = err as api.ImportMenuError;
        setError(importError.message || 'Import failed');
        setViolations(importError.violations ?? []);
      }
    } finally {
      if (previewRequestIdRef.current === requestId) {
        setSubmitting(false);
      }
    }
  }, []);

  // Auto-preview after 1 s debounce
  useEffect(() => {
    // Bump request ID to invalidate any in-flight preview
    const requestId = ++previewRequestIdRef.current;

    if (!jsonTextInput.trim()) {
      setError('');
      setViolations([]);
      setPreview(null);
      setPendingPayload(null);
      return;
    }
    // Clear stale preview/errors while debouncing so UI doesn't show outdated state
    setPreview(null);
    setPendingPayload(null);
    setError('');
    setViolations([]);
    const timer = setTimeout(() => {
      void triggerJsonTextPreview(jsonTextInput, requestId);
    }, 1000);
    return () => clearTimeout(timer);
  }, [jsonTextInput, triggerJsonTextPreview]);

  const copyPromptTemplate = async () => {
    if (!navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(MENU_IMPORT_LLM_PROMPT);
      setCopyStatus('copied');
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      // silently ignore
    }
  };

  // Clean up copy-status timer on unmount
  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft/40 p-4 shadow-sm">
      {/* Row 1: AI help text with "Copy AI prompt" button */}
      <div className="rounded border border-border bg-surface p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-xs text-fg-muted">
            You can use AI to generate the menu JSON from a PDF or website. Copy the prompt, paste it into your AI assistant, and provide the menu text.
          </p>
          <button
            type="button"
            onClick={() => { void copyPromptTemplate(); }}
            className="w-full shrink-0 rounded border border-accent px-3 py-2 text-xs font-medium text-accent-fg hover:bg-surface-muted sm:w-auto sm:py-1"
          >
            {copyStatus === 'copied' ? 'Copied' : 'Copy AI prompt'}
          </button>
        </div>
      </div>

      {/* Row 2: JSON textarea with "Import from JSON file" button */}
      <div className="mt-3 rounded border border-border bg-surface p-3">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label htmlFor="menu-import-json-text" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Paste menu JSON
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => { void handleFileChange(e); }}
            className="hidden"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded border border-accent px-3 py-2 text-xs font-medium text-accent-fg hover:bg-surface-muted disabled:opacity-50 sm:w-auto sm:py-1"
          >
            Import from JSON file
          </button>
        </div>
        <textarea
          id="menu-import-json-text"
          value={jsonTextInput}
          onChange={(event) => setJsonTextInput(event.target.value)}
          rows={7}
          className="w-full rounded border border-border bg-surface px-3 py-2 font-mono text-xs text-fg focus:border-accent focus:outline-none"
          placeholder="Menu JSON..."
        />
      </div>

      {/* Feedback area */}
      {success && <p className="mt-3 text-xs text-success-fg">{success}</p>}
      {error && <p className="mt-3 text-xs text-danger-fg">{error}</p>}
      {violations.length > 0 && (
        <ul className="mt-3 max-h-40 list-disc overflow-y-auto rounded border border-danger bg-danger-soft p-3 pl-6 text-xs text-danger-fg">
          {violations.map((violation) => (
            <li key={`${violation.path}:${violation.message}`}>
              <span className="font-semibold">{String(violation.path)}</span>: {String(violation.message)}
            </li>
          ))}
        </ul>
      )}

      {/* Preview panel — always visible */}
      <div className="mt-3 rounded border border-border bg-surface p-3 text-xs">
        {preview && pendingPayload !== null ? (
          <div className="text-warning-fg">
            <p className="mb-1 font-semibold">Confirm import for &quot;{String(preview.menuName)}&quot;?</p>
            <p className="mb-2">
              {preview.menuExists ? 'Existing menu will be updated.' : 'New menu will be created.'}
            </p>
            <ul className="mb-3 list-disc pl-5">
              <li>Created items: {Number(preview.itemSummary.created)}</li>
              <li>Updated items: {Number(preview.itemSummary.updated)}</li>
              <li>Deleted items: {Number(preview.itemSummary.deleted)}</li>
            </ul>
          </div>
        ) : (
          <p className="text-fg-muted">
            {error ? 'Fix the errors above to preview the import.' : 'Import or enter menu JSON to see a preview.'}
          </p>
        )}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={submitting || !preview || pendingPayload === null}
            onClick={() => {
              void (async () => {
                if (!pendingPayload) return;
                setSubmitting(true);
                setError('');
                let imported = false;
                try {
                  const result = await api.importMenuJson(pendingPayload);
                  setSuccess(
                    result.created
                      ? `Imported menu "${result.menu.name}"`
                      : `Updated menu "${result.menu.name}" from import`,
                  );
                  setJsonTextInput('');
                  setPreview(null);
                  setPendingPayload(null);
                  imported = true;
                } catch (err) {
                  const importError = err as api.ImportMenuError;
                  setError(importError.message || 'Import failed');
                  setViolations(importError.violations ?? []);
                } finally {
                  setSubmitting(false);
                }
                if (imported) onClose();
              })();
            }}
            className="w-full rounded bg-success-solid px-3 py-2 font-medium text-success-on transition-colors hover:opacity-90 disabled:opacity-50 sm:w-auto sm:py-1"
          >
            Confirm Import
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="w-full rounded border border-border bg-surface px-3 py-2 font-medium text-fg hover:bg-surface-muted disabled:opacity-50 sm:w-auto sm:py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Item Form ──────────────────────────────────────────

function AddItemForm({ menuId }: { menuId: string }) {
  const [open, setOpen] = useState(false);
  const [itemNumber, setItemNumber] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Item name cannot be empty');
      return;
    }
    if (trimmed.length > 80) {
      setError('Item name must be 80 characters or fewer');
      return;
    }
    if (itemNumber.trim().length > 40) {
      setError('Item number must be 40 characters or fewer');
      return;
    }
    const parsedPrice = parseItemPriceInput(price);
    if (parsedPrice.error) {
      setError(parsedPrice.error);
      return;
    }
    setSubmitting(true);
    try {
      await api.createMenuItem(menuId, {
        name: trimmed,
        description: description.trim() || undefined,
        itemNumber: itemNumber.trim() || null,
        price: parsedPrice.value,
      });
      setItemNumber('');
      setName('');
      setDescription('');
      setPrice('');
      setError('');
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex min-h-9 items-center rounded px-2 py-1 text-xs font-medium text-accent hover:bg-surface-muted hover:text-accent-fg"
      >
        + Add item
      </button>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-2 space-y-2 rounded border border-border bg-surface-muted p-3">
      <input
        type="text"
        value={itemNumber}
        onChange={(e) => { setItemNumber(e.target.value); setError(''); }}
        maxLength={40}
        className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
        placeholder="Meal number (optional)"
        autoFocus
      />
      <input
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); setError(''); }}
        maxLength={80}
        className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
        placeholder="Item name"
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={200}
        className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
        placeholder="Description (optional)"
      />
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        max="9999.99"
        value={price}
        onChange={(e) => { setPrice(e.target.value); setError(''); }}
        className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
        placeholder="Price (optional)"
      />
      {error && <p className="text-sm text-danger-fg">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-accent-solid px-3 py-2 text-xs font-medium text-accent-on transition-colors hover:opacity-90 disabled:opacity-50 sm:w-auto sm:py-1"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setItemNumber('');
            setName('');
            setDescription('');
            setPrice('');
            setError('');
          }}
          className="w-full rounded px-3 py-2 text-xs text-fg-muted hover:bg-surface-muted sm:w-auto sm:py-1"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Menu Card ──────────────────────────────────────────────

function DefaultMealPreferenceEditor({
  menu,
  nickname,
  preference,
  onSaved,
}: {
  menu: Menu;
  nickname: string | null;
  preference?: UserMenuDefaultPreference;
  onSaved: (preference: UserMenuDefaultPreference) => void;
}) {
  const [selectedItemId, setSelectedItemId] = useState(preference?.itemId ?? '');
  const [defaultComment, setDefaultComment] = useState(preference?.defaultComment ?? '');
  const [allowOrganizerFallback, setAllowOrganizerFallback] = useState(
    preference?.allowOrganizerFallback ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setSelectedItemId(preference?.itemId ?? '');
    setDefaultComment(preference?.defaultComment ?? '');
    setAllowOrganizerFallback(preference?.allowOrganizerFallback ?? false);
    setError('');
  }, [preference?.allowOrganizerFallback, preference?.defaultComment, preference?.itemId]);

  if (!nickname) {
    return null;
  }

  const hasItems = menu.items.length > 0;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const saved = await api.updateUserMenuDefaultPreference(
        menu.id,
        nickname,
        selectedItemId || null,
        selectedItemId ? defaultComment : null,
        selectedItemId ? allowOrganizerFallback : false,
      );
      onSaved(saved);
      setSuccess(saved.itemId ? 'Default meal saved.' : 'Default meal cleared.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded border border-success bg-success-soft p-3">
      <h4 className="text-sm font-semibold text-success-fg">My default meal</h4>
      {!hasItems ? (
        <p className="mt-2 text-sm text-success-fg">
          Add menu items before selecting a default meal.
        </p>
      ) : (
        <>
          <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-success-fg">
            Default meal
          </label>
          <select
            value={selectedItemId}
            onChange={(event) => {
              const nextItemId = event.target.value;
              setSelectedItemId(nextItemId);
              if (!nextItemId) {
                setDefaultComment('');
                setAllowOrganizerFallback(false);
              }
              setError('');
              setSuccess('');
            }}
            className="mt-1 w-full rounded border border-success bg-surface px-3 py-2 text-sm text-fg focus:border-success focus:outline-none"
            aria-label={`Default meal for ${menu.name}`}
          >
            <option value="">No default meal selected</option>
            {menu.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.itemNumber ? `${item.itemNumber} ` : ''}
                {item.name}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-success-fg">
            Default comment
          </label>
          <textarea
            value={defaultComment}
            onChange={(event) => {
              setDefaultComment(event.target.value);
              setError('');
              setSuccess('');
            }}
            disabled={!selectedItemId}
            maxLength={200}
            rows={3}
            className="mt-1 w-full rounded border border-success bg-surface px-3 py-2 text-sm text-fg focus:border-success focus:outline-none disabled:bg-success-soft"
            aria-label={`Default comment for ${menu.name}`}
            placeholder="Optional notes for your saved default meal"
          />
          <p className="mt-1 text-xs text-success-fg">
            Used as the saved order comment if an organizer places this default meal for you.
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm text-success-fg">
            <input
              type="checkbox"
              checked={allowOrganizerFallback}
              disabled={!selectedItemId}
              onChange={(event) => {
                setAllowOrganizerFallback(event.target.checked);
                setError('');
                setSuccess('');
              }}
              className="mt-0.5"
            />
            <span>Allow organizers to order this default meal for me if I do not respond in time.</span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded bg-success-solid px-3 py-1.5 text-xs font-medium text-success-on transition-colors hover:opacity-90 disabled:opacity-50"
            >
              Save default
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedItemId('');
                setDefaultComment('');
                setAllowOrganizerFallback(false);
                setError('');
                setSuccess('');
              }}
              disabled={saving || (!selectedItemId && !allowOrganizerFallback)}
              className="rounded border border-success bg-surface px-3 py-1.5 text-xs font-medium text-success-fg hover:bg-success-soft disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>
          {success ? <p className="mt-2 text-xs text-success-fg">{success}</p> : null}
          {error ? <p className="mt-2 text-xs text-danger-fg">{error}</p> : null}
        </>
      )}
    </div>
  );
}

type MenuContactIconKind = 'external' | 'cart' | 'phone' | 'location';

type MenuContactLink = {
  key: string;
  href: string;
  label: string;
  icon: MenuContactIconKind;
  maxWidthClass: string;
  ariaLabel?: string;
  title?: string;
};

function getMenuContactLinks(menu: Menu): MenuContactLink[] {
  const links: MenuContactLink[] = [];
  if (menu.url) {
    links.push({ key: 'url', href: menu.url, label: menu.url, icon: 'external', maxWidthClass: 'max-w-[14rem]' });
  }
  if (menu.orderUrl) {
    links.push({
      key: 'order',
      href: menu.orderUrl,
      label: 'Order',
      icon: 'cart',
      maxWidthClass: 'max-w-[14rem]',
      ariaLabel: `Order from ${menu.name}`,
      title: menu.orderUrl,
    });
  }
  if (menu.phone) {
    links.push({ key: 'phone', href: `tel:${menu.phone}`, label: menu.phone, icon: 'phone', maxWidthClass: 'max-w-[10rem]' });
  }
  if (menu.location) {
    links.push({
      key: 'location',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(menu.location)}`,
      label: menu.location,
      icon: 'location',
      maxWidthClass: 'max-w-[14rem]',
    });
  }
  return links;
}

function MenuContactIcon({ kind }: { kind: MenuContactIconKind }) {
  if (kind === 'cart') {
    return (
      <>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </>
    );
  }
  if (kind === 'phone') {
    return (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.78 19.78 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.78 19.78 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.91.35 1.8.68 2.64a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.44-1.25a2 2 0 0 1 2.11-.45c.84.33 1.73.56 2.64.68A2 2 0 0 1 22 16.92z" />
    );
  }
  if (kind === 'location') {
    return (
      <>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    );
  }
  return (
    <>
      <path d="M14 3h7v7" />
      <path d="M10 14L21 3" />
      <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
    </>
  );
}

function MenuContactLinks({ menu }: { menu: Menu }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2" onClick={(event) => event.stopPropagation()}>
      {getMenuContactLinks(menu).map((link) => (
        <a
          key={link.key}
          href={link.href}
          target={link.href.startsWith('tel:') ? undefined : '_blank'}
          rel={link.href.startsWith('tel:') ? undefined : 'noopener noreferrer'}
          aria-label={link.ariaLabel}
          title={link.title}
          className={`inline-flex ${link.maxWidthClass} items-center truncate text-xs text-fg-muted hover:text-fg hover:underline`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-1 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <MenuContactIcon kind={link.icon} />
          </svg>
          {link.label}
        </a>
      ))}
    </div>
  );
}

function MenuCardActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={onEdit} aria-label="Edit" title="Edit" className="rounded p-1.5 text-accent hover:bg-surface-muted">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
        <span className="sr-only">Edit</span>
      </button>
      <button type="button" onClick={onDelete} aria-label="Delete" title="Delete" className="rounded p-1.5 text-danger-fg hover:bg-surface-muted">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
        <span className="sr-only">Delete</span>
      </button>
    </div>
  );
}

function MenuCardHeader({
  menu,
  collapsed,
  onToggle,
  onEdit,
  onDelete,
}: {
  menu: Menu;
  collapsed: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex cursor-pointer flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={collapsed ? `Expand ${menu.name}` : `Collapse ${menu.name}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <h3 className="font-semibold text-fg">{menu.name}</h3>
          <MenuContactLinks menu={menu} />
        </div>
        <span className="text-xs text-fg-muted">
          {menu.items.length} {menu.items.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      {!collapsed && <MenuCardActions onEdit={onEdit} onDelete={onDelete} />}
    </div>
  );
}

function MenuCardContent({
  menu,
  nickname,
  defaultPreference,
  onDefaultPreferenceSaved,
}: {
  menu: Menu;
  nickname: string | null;
  defaultPreference?: UserMenuDefaultPreference;
  onDefaultPreferenceSaved: (preference: UserMenuDefaultPreference) => void;
}) {
  return (
    <div className="px-4 py-2">
      {menu.items.length === 0 ? (
        <p className="text-sm italic text-fg-muted">No items yet</p>
      ) : (
        <>
          <div className="mb-1 hidden gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-fg-muted sm:grid sm:grid-cols-[max-content_minmax(0,1fr)_minmax(0,4fr)_max-content_max-content_max-content]">
            <span>No.</span>
            <span>Item name</span>
            <span className="text-left">Description</span>
            <span>Price</span>
            <span className="justify-self-center">Edit</span>
            <span className="justify-self-center">Delete</span>
          </div>
          <div className="space-y-1">
            {menu.items.map((item) => (
              <MenuItemRow key={item.id} item={item} menuId={menu.id} />
            ))}
          </div>
        </>
      )}
      <AddItemForm menuId={menu.id} />
      <DefaultMealPreferenceEditor
        menu={menu}
        nickname={nickname}
        preference={defaultPreference}
        onSaved={onDefaultPreferenceSaved}
      />
    </div>
  );
}

function MenuCard({
  menu,
  nickname,
  defaultPreference,
  onDefaultPreferenceSaved,
}: {
  menu: Menu;
  nickname: string | null;
  defaultPreference?: UserMenuDefaultPreference;
  onDefaultPreferenceSaved: (preference: UserMenuDefaultPreference) => void;
}) {
  const [editingMenu, setEditingMenu] = useState(false);
  const [nameInput, setNameInput] = useState(menu.name);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [locationInput, setLocationInput] = useState(menu.location ?? '');
  const [phoneInput, setPhoneInput] = useState(menu.phone ?? '');
  const [urlInput, setUrlInput] = useState(menu.url ?? '');
  const [orderUrlInput, setOrderUrlInput] = useState(menu.orderUrl ?? '');
  const [contactError, setContactError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const handleMenuSave = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setContactError('Menu name cannot be empty');
      return;
    }
    if (trimmed.length > 60) {
      setContactError('Menu name must be 60 characters or fewer');
      return;
    }

    const parsedLocation = normalizeMenuContactInput(locationInput, 160);
    if (parsedLocation.error) {
      setContactError(`Location: ${parsedLocation.error}`);
      return;
    }
    const parsedPhone = normalizeMenuContactInput(phoneInput, 40);
    if (parsedPhone.error) {
      setContactError(`Phone: ${parsedPhone.error}`);
      return;
    }
    const parsedUrl = parseMenuUrlInput(urlInput);
    if (parsedUrl.error) {
      setContactError(parsedUrl.error);
      return;
    }
    const parsedOrderUrl = parseMenuUrlInput(orderUrlInput);
    if (parsedOrderUrl.error) {
      setContactError(`Order URL: ${parsedOrderUrl.error}`);
      return;
    }

    setSubmitting(true);
    setContactError('');
    try {
      await api.updateMenu(menu.id, {
        name: trimmed,
        location: parsedLocation.value,
        phone: parsedPhone.value,
        url: parsedUrl.value,
        orderUrl: parsedOrderUrl.value,
      });
      setEditingMenu(false);
      setError('');
    } catch (err) {
      setContactError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await api.deleteMenu(menu.id);
      setConfirmDelete(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = () => {
    setNameInput(menu.name);
    setLocationInput(menu.location ?? '');
    setPhoneInput(menu.phone ?? '');
    setUrlInput(menu.url ?? '');
    setOrderUrlInput(menu.orderUrl ?? '');
    setContactError('');
    setEditingMenu(true);
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-surface shadow-sm">
        <MenuCardHeader
          menu={menu}
          collapsed={collapsed}
          onToggle={() => setCollapsed((prev) => !prev)}
          onEdit={openEditDialog}
          onDelete={() => setConfirmDelete(true)}
        />

        {error && (
          <p className="px-4 py-1 text-sm text-danger-fg">{error}</p>
        )}

        {!collapsed && (
          <MenuCardContent
            menu={menu}
            nickname={nickname}
            defaultPreference={defaultPreference}
            onDefaultPreferenceSaved={onDefaultPreferenceSaved}
          />
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete menu "${menu.name}" and all its items?`}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {editingMenu && (
        <MenuEditDialog
          menuName={menu.name}
          name={nameInput}
          location={locationInput}
          phone={phoneInput}
          url={urlInput}
          orderUrl={orderUrlInput}
          error={contactError}
          submitting={submitting}
          onNameChange={(value) => {
            setNameInput(value);
            setContactError('');
          }}
          onLocationChange={(value) => {
            setLocationInput(value);
            setContactError('');
          }}
          onPhoneChange={(value) => {
            setPhoneInput(value);
            setContactError('');
          }}
          onUrlChange={(value) => {
            setUrlInput(value);
            setContactError('');
          }}
          onOrderUrlChange={(value) => {
            setOrderUrlInput(value);
            setContactError('');
          }}
          onSave={() => void handleMenuSave()}
          onCancel={() => {
            setEditingMenu(false);
            setContactError('');
          }}
        />
      )}
    </>
  );
}

// ─── Create Menu Button + Form ──────────────────────────────

function NewMenuDropdown({
  menus,
  onToggleImport,
}: {
  menus: Menu[];
  onToggleImport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const generateMenuName = (): string => {
    const existingNames = new Set(menus.map((m) => m.name.toLowerCase()));
    let counter = 1;
    while (existingNames.has(`new menu ${counter}`)) {
      counter++;
    }
    return `New Menu ${counter}`;
  };

  const [creating, setCreating] = useState(false);

  const handleCreateManually = async () => {
    if (creating) return;
    setOpen(false);
    setError('');
    setCreating(true);
    const name = generateMenuName();
    try {
      await api.createMenu(name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleImportFromJson = () => {
    setOpen(false);
    onToggleImport();
  };

  return (
    <div ref={dropdownRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded bg-accent-solid px-4 py-2 text-sm font-medium text-accent-on transition-colors hover:opacity-90"
        aria-haspopup="true"
        aria-expanded={open}
      >
        + New Menu
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-48 rounded border border-border bg-surface py-1 shadow-lg">
          <button
            type="button"
            onClick={handleImportFromJson}
            className="w-full px-4 py-2 text-left text-sm text-fg hover:bg-surface-muted"
          >
            Import from JSON
          </button>
          <button
            type="button"
            onClick={() => void handleCreateManually()}
            className="w-full px-4 py-2 text-left text-sm text-fg hover:bg-surface-muted"
          >
            Manually
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-danger-fg">{error}</p>}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function ManageMenus() {
  const { menus } = useAppState();
  const actorLabel = getAuthenticatedDisplayLabel();
  const [importOpen, setImportOpen] = useState(false);
  const [menuDefaultsByMenuId, setMenuDefaultsByMenuId] = useState<
    Record<string, UserMenuDefaultPreference>
  >({});
  const [defaultsLoading, setDefaultsLoading] = useState(false);
  const [defaultsError, setDefaultsError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadDefaults = async () => {
      if (!actorLabel) {
        setMenuDefaultsByMenuId({});
        setDefaultsError('');
        return;
      }

      setDefaultsLoading(true);
      setDefaultsError('');
      try {
        const preferences = await api.getUserMenuDefaultPreferences(actorLabel);
        if (cancelled) {
          return;
        }
        setMenuDefaultsByMenuId(
          Object.fromEntries(preferences.map((preference) => [preference.menuId, preference])),
        );
      } catch (err) {
        if (cancelled) {
          return;
        }
        setDefaultsError((err as Error).message);
      } finally {
        if (!cancelled) {
          setDefaultsLoading(false);
        }
      }
    };

    void loadDefaults();

    return () => {
      cancelled = true;
    };
  }, [actorLabel]);

  // Sort alphabetically
  const sorted = [...menus].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg">Manage Menus</h1>
      </div>
      {defaultsLoading ? (
        <p className="mb-4 text-sm text-fg-muted">Loading your default meals...</p>
      ) : null}
      {defaultsError ? (
        <p className="mb-4 text-sm text-danger-fg">{defaultsError}</p>
      ) : null}

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <NewMenuDropdown menus={menus} onToggleImport={() => setImportOpen(true)} />
          </div>
        </div>

        {importOpen && <ImportMenuPanel onClose={() => setImportOpen(false)} />}

        {sorted.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
            <p className="text-fg-muted">No menus yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sorted.map((menu) => (
              <MenuCard
                key={menu.id}
                menu={menu}
                nickname={actorLabel}
                defaultPreference={menuDefaultsByMenuId[menu.id]}
                onDefaultPreferenceSaved={(preference) => {
                  setMenuDefaultsByMenuId((prev) => {
                    if (!preference.itemId) {
                      const { [preference.menuId]: _removed, ...rest } = prev;
                      return rest;
                    }

                    return {
                      ...prev,
                      [preference.menuId]: preference,
                    };
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
