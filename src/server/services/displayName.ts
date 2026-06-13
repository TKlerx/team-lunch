import { serviceError } from '../routes/routeUtils.js';

export type DisplayNameSource = 'local' | 'entra';

const MAX_DISPLAY_NAME_GRAPHEMES = 64;
const BIDI_OVERRIDE_OR_ISOLATE = /[\u202A-\u202E\u2066-\u2069]/u;
const INVISIBLE_SPOOFING = /[\u200B-\u200F\u061C\u034F\u00AD\uFEFF]/u;
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cs}]/u;
const HTML_SENSITIVE = /[<>&"]/u;

function countGraphemes(value: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return [...segmenter.segment(value)].length;
  }
  return [...value].length;
}

export function normalizeDisplayName(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (countGraphemes(trimmed) > MAX_DISPLAY_NAME_GRAPHEMES) {
    throw serviceError('Display name must be 64 characters or fewer', 400);
  }
  if (
    CONTROL_CHARACTERS.test(trimmed) ||
    BIDI_OVERRIDE_OR_ISOLATE.test(trimmed) ||
    INVISIBLE_SPOOFING.test(trimmed) ||
    HTML_SENSITIVE.test(trimmed)
  ) {
    throw serviceError('Display name contains unsupported characters', 400);
  }

  return trimmed;
}

export function resolveDisplayNameSnapshot(displayName: string | null | undefined, email: string): string {
  return normalizeDisplayName(displayName) ?? email;
}
