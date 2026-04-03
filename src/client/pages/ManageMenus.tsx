import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useAppState } from '../context/AppContext.js';
import { useNickname } from '../hooks/useNickname.js';
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

  try {
    new URL(normalized.value);
  } catch {
    return { value: null, error: 'URL must be a valid absolute URL' };
  }
  return normalized;
}

// ─── Import Helper ──────────────────────────────────────────────────────────────

function ImportMenuHelper() {
  const [copyStatus, setCopyStatus] = useState('');

  const copyText = async (text: string, successLabel: string) => {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus('Clipboard is unavailable in this browser context. Copy manually from the text blocks.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(successLabel);
    } catch {
      setCopyStatus('Could not copy to clipboard. Copy manually from the text blocks.');
    }
  };

  return (
    <details className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">
        Import helper (schema + LLM prompt)
      </summary>
      <p className="mt-2 text-slate-700">
        Use this when an admin wants to convert copied menu text into the required JSON import format.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { void copyText(MENU_IMPORT_SCHEMA_TEXT, 'JSON schema copied.'); }}
          className="rounded border border-slate-300 bg-white px-3 py-1 font-medium text-slate-800 hover:bg-slate-100"
        >
          Copy JSON schema
        </button>
        <button
          type="button"
          onClick={() => { void copyText(MENU_IMPORT_LLM_PROMPT, 'LLM prompt copied.'); }}
          className="rounded border border-slate-300 bg-white px-3 py-1 font-medium text-slate-800 hover:bg-slate-100"
        >
          Copy LLM prompt
        </button>
      </div>
      {copyStatus && (
        <p className="mt-2 text-slate-700">{copyStatus}</p>
      )}
      <div className="mt-3 grid gap-3">
        <div>
          <p className="mb-1 font-semibold text-slate-900">JSON schema</p>
          <pre className="max-h-56 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] leading-relaxed">{MENU_IMPORT_SCHEMA_TEXT}</pre>
        </div>
        <div>
          <p className="mb-1 font-semibold text-slate-900">LLM prompt template</p>
          <pre className="max-h-56 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] leading-relaxed">{MENU_IMPORT_LLM_PROMPT}</pre>
        </div>
      </div>
    </details>
  );
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
      <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <p className="mb-4 text-gray-900">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
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
  error,
  submitting,
  onNameChange,
  onLocationChange,
  onPhoneChange,
  onUrlChange,
  onSave,
  onCancel,
}: {
  menuName: string;
  name: string;
  location: string;
  phone: string;
  url: string;
  error: string;
  submitting: boolean;
  onNameChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h4 className="text-base font-semibold text-gray-900">Edit menu {menuName}</h4>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="menu-edit-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Name
            </label>
            <input
              id="menu-edit-name"
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={60}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Menu name"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="menu-contact-location" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Location
            </label>
            <input
              id="menu-contact-location"
              type="text"
              value={location}
              onChange={(event) => onLocationChange(event.target.value)}
              maxLength={160}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Street or office location"
            />
          </div>
          <div>
            <label htmlFor="menu-contact-phone" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Phone
            </label>
            <input
              id="menu-contact-phone"
              type="text"
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value)}
              maxLength={40}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Phone number"
            />
          </div>
          <div>
            <label htmlFor="menu-contact-url" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              URL
            </label>
            <input
              id="menu-contact-url"
              type="url"
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              maxLength={255}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="https://example.com"
            />
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
      <div className="rounded border border-blue-200 bg-blue-50 p-3">
        <div className="space-y-2">
          <input
            type="text"
            value={itemNumber}
            onChange={(e) => { setItemNumber(e.target.value); setError(''); }}
            maxLength={40}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Meal number (optional)"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            maxLength={80}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Item name"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
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
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Price (optional)"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={submitting}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
              className="rounded px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
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
      <div className="grid grid-cols-[max-content_minmax(0,1fr)_minmax(0,4fr)_max-content_max-content_max-content] items-start gap-2 rounded px-3 py-2 hover:bg-gray-50">
        <p className="whitespace-nowrap text-sm font-medium text-gray-500">{item.itemNumber ?? '-'}</p>
        <p className="truncate text-sm font-medium text-gray-800">{item.name}</p>
        <p className="whitespace-normal break-words text-left text-sm text-gray-500">{item.description ?? '-'}</p>
        <p className="whitespace-nowrap text-sm font-medium text-emerald-700">{formatPrice(item.price)}</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit"
          title="Edit"
          className="justify-self-center whitespace-nowrap rounded p-1.5 text-blue-600 hover:bg-blue-50"
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
          className="justify-self-center whitespace-nowrap rounded p-1.5 text-red-600 hover:bg-red-50"
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

function ImportMenuForm() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [violations, setViolations] = useState<ImportMenuViolation[]>([]);
  const [pendingPayload, setPendingPayload] = useState<unknown | null>(null);
  const [preview, setPreview] = useState<ImportMenuPreviewResponse | null>(null);
  const [jsonTextInput, setJsonTextInput] = useState('');

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

  const previewImportPayload = async (payload: unknown) => {
    setSubmitting(true);
    setError('');
    setSuccess('');
    setViolations([]);
    try {
      const previewResult = await api.previewImportMenuJson(payload);
      setPendingPayload(payload);
      setPreview(previewResult);
    } catch (err) {
      const importError = err as api.ImportMenuError;
      setError(importError.message || 'Import failed');
      setViolations(importError.violations ?? []);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await readFileText(file);
      const payload = JSON.parse(text) as unknown;
      await previewImportPayload(payload);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Selected file is not valid JSON');
      } else {
        const importError = err as api.ImportMenuError;
        setError(importError.message || 'Import failed');
        setViolations(importError.violations ?? []);
      }
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleJsonTextPreview = async () => {
    const trimmed = jsonTextInput.trim();
    if (!trimmed) {
      setError('Paste JSON content first');
      setSuccess('');
      setViolations([]);
      return;
    }

    try {
      const payload = JSON.parse(trimmed) as unknown;
      await previewImportPayload(payload);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Pasted content is not valid JSON');
        setSuccess('');
        setViolations([]);
      } else {
        const importError = err as api.ImportMenuError;
        setError(importError.message || 'Import failed');
        setViolations(importError.violations ?? []);
      }
    }
  };

  return (
    <div className="flex w-full max-w-lg flex-col items-end gap-2">
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
        className="rounded border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
      >
        Import JSON
      </button>
      <div className="w-full rounded border border-gray-200 bg-white p-3">
        <label htmlFor="menu-import-json-text" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
          Paste JSON
        </label>
        <textarea
          id="menu-import-json-text"
          value={jsonTextInput}
          onChange={(event) => setJsonTextInput(event.target.value)}
          rows={7}
          className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none"
          placeholder="Paste menu import JSON here"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={submitting}
            onClick={() => { void handleJsonTextPreview(); }}
            className="rounded border border-blue-600 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            Preview pasted JSON
          </button>
        </div>
      </div>

      {success && <p className="text-xs text-emerald-700">{success}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
      {violations.length > 0 && (
        <ul className="max-h-40 w-full max-w-lg list-disc overflow-y-auto rounded border border-red-200 bg-red-50 p-3 pl-6 text-xs text-red-800">
          {violations.map((violation) => (
            <li key={`${violation.path}:${violation.message}`}>
              <span className="font-semibold">{String(violation.path)}</span>: {String(violation.message)}
            </li>
          ))}
        </ul>
      )}

      {preview && pendingPayload !== null && (
        <div className="w-full max-w-lg rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="mb-1 font-semibold">Confirm import for "{String(preview.menuName)}"?</p>
          <p className="mb-2">
            {preview.menuExists ? 'Existing menu will be updated.' : 'New menu will be created.'}
          </p>
          <ul className="mb-3 list-disc pl-5">
            <li>Created items: {Number(preview.itemSummary.created)}</li>
            <li>Updated items: {Number(preview.itemSummary.updated)}</li>
            <li>Deleted items: {Number(preview.itemSummary.deleted)}</li>
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                void (async () => {
                  if (!pendingPayload) return;
                  setSubmitting(true);
                  setError('');
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
                  } catch (err) {
                    const importError = err as api.ImportMenuError;
                    setError(importError.message || 'Import failed');
                    setViolations(importError.violations ?? []);
                  } finally {
                    setSubmitting(false);
                  }
                })();
              }}
              className="rounded bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Confirm Import
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setPreview(null);
                setPendingPayload(null);
                setSuccess('Import cancelled');
              }}
              className="rounded border border-gray-300 bg-white px-3 py-1 font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
        className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800"
      >
        + Add item
      </button>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-2 space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
      <input
        type="text"
        value={itemNumber}
        onChange={(e) => { setItemNumber(e.target.value); setError(''); }}
        maxLength={40}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        placeholder="Meal number (optional)"
        autoFocus
      />
      <input
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); setError(''); }}
        maxLength={80}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        placeholder="Item name"
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={200}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
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
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        placeholder="Price (optional)"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
          className="rounded px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
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
    <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3">
      <h4 className="text-sm font-semibold text-emerald-900">My default meal</h4>
      {!hasItems ? (
        <p className="mt-2 text-sm text-emerald-800">
          Add menu items before selecting a default meal.
        </p>
      ) : (
        <>
          <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-emerald-900">
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
            className="mt-1 w-full rounded border border-emerald-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none"
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
          <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-emerald-900">
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
            className="mt-1 w-full rounded border border-emerald-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none disabled:bg-emerald-100"
            aria-label={`Default comment for ${menu.name}`}
            placeholder="Optional notes for your saved default meal"
          />
          <p className="mt-1 text-xs text-emerald-800">
            Used as the saved order comment if an organizer places this default meal for you.
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm text-emerald-900">
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
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
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
              className="rounded border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>
          {success ? <p className="mt-2 text-xs text-emerald-700">{success}</p> : null}
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        </>
      )}
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

    setSubmitting(true);
    setContactError('');
    try {
      await api.updateMenu(menu.id, {
        name: trimmed,
        location: parsedLocation.value,
        phone: parsedPhone.value,
        url: parsedUrl.value,
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
    setContactError('');
    setEditingMenu(true);
  };

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {/* Menu header */}
        <div
          className="flex cursor-pointer items-start justify-between border-b border-gray-100 px-4 py-3"
          onClick={() => setCollapsed((prev) => !prev)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setCollapsed((prev) => !prev);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={collapsed ? `Expand ${menu.name}` : `Collapse ${menu.name}`}
        >
          <>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <h3 className="font-semibold text-gray-900">{menu.name}</h3>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2" onClick={(event) => event.stopPropagation()}>
                  {menu.url ? (
                    <a
                      href={menu.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-[14rem] items-center truncate text-xs text-gray-500 hover:text-gray-900 hover:underline"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="mr-1 h-4 w-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 3h7v7" />
                        <path d="M10 14L21 3" />
                        <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
                      </svg>
                      {menu.url}
                    </a>
                  ) : null}
                  {menu.phone ? (
                    <a
                      href={`tel:${menu.phone}`}
                      className="inline-flex max-w-[10rem] items-center truncate text-xs text-gray-500 hover:text-gray-900 hover:underline"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="mr-1 h-4 w-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.78 19.78 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.78 19.78 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.91.35 1.8.68 2.64a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.44-1.25a2 2 0 0 1 2.11-.45c.84.33 1.73.56 2.64.68A2 2 0 0 1 22 16.92z" />
                      </svg>
                      {menu.phone}
                    </a>
                  ) : null}
                  {menu.location ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(menu.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-[14rem] items-center truncate text-xs text-gray-500 hover:text-gray-900 hover:underline"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="mr-1 h-4 w-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {menu.location}
                    </a>
                  ) : null}
                </div>
              </div>
              <span className="text-xs text-gray-500">
                {menu.items.length} {menu.items.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            {!collapsed && (
              <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  onClick={openEditDialog}
                  aria-label="Edit"
                  title="Edit"
                  className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
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
                  className="rounded p-1.5 text-red-600 hover:bg-red-50"
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
            )}
          </>
        </div>

        {error && (
          <p className="px-4 py-1 text-sm text-red-600">{error}</p>
        )}

        {!collapsed && (
          <div className="px-4 py-2">
            {menu.items.length === 0 ? (
              <p className="text-sm italic text-gray-400">No items yet</p>
            ) : (
              <>
                <div className="mb-1 grid grid-cols-[max-content_minmax(0,1fr)_minmax(0,4fr)_max-content_max-content_max-content] gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
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

// ─── Create Menu Form ───────────────────────────────────────

function CreateMenuForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Menu name cannot be empty');
      return;
    }
    if (trimmed.length > 60) {
      setError('Menu name must be 60 characters or fewer');
      return;
    }
    setSubmitting(true);
    try {
      await api.createMenu(trimmed);
      setName('');
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
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Menu
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
      <form onSubmit={(e) => void handleSubmit(e)}>
        <label className="mb-1 block text-sm font-medium text-gray-700">Menu name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          maxLength={60}
          className="mb-2 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="e.g. Italian"
          autoFocus
        />
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setName(''); setError(''); }}
            className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function ManageMenus() {
  const { menus } = useAppState();
  const { nickname } = useNickname();
  const [menuDefaultsByMenuId, setMenuDefaultsByMenuId] = useState<
    Record<string, UserMenuDefaultPreference>
  >({});
  const [defaultsLoading, setDefaultsLoading] = useState(false);
  const [defaultsError, setDefaultsError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadDefaults = async () => {
      if (!nickname) {
        setMenuDefaultsByMenuId({});
        setDefaultsError('');
        return;
      }

      setDefaultsLoading(true);
      setDefaultsError('');
      try {
        const preferences = await api.getUserMenuDefaultPreferences(nickname);
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
  }, [nickname]);

  // Sort alphabetically
  const sorted = [...menus].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="w-full p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Manage Menus</h1>
        <ImportMenuForm />
      </div>
      <div className="mb-6">
        <ImportMenuHelper />
      </div>
      {defaultsLoading ? (
        <p className="mb-4 text-sm text-gray-500">Loading your default meals...</p>
      ) : null}
      {defaultsError ? (
        <p className="mb-4 text-sm text-red-600">{defaultsError}</p>
      ) : null}

      <div className="space-y-4">
        <CreateMenuForm />

        {sorted.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-600">No menus yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sorted.map((menu) => (
              <MenuCard
                key={menu.id}
                menu={menu}
                nickname={nickname}
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
