import prisma from '../db.js';
import type { UserMenuDefaultPreference } from '../../lib/types.js';

const MAX_USER_KEY_LENGTH = 255;
const MAX_DEFAULT_COMMENT_LENGTH = 200;

function normalizeUserKey(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_USER_KEY_LENGTH) {
    throw Object.assign(new Error('User key must be 1-255 characters'), { statusCode: 400 });
  }
  return trimmed;
}

function formatPreference(record: {
  userKey: string;
  menuId: string;
  itemId: string;
  defaultComment: string | null;
  allowOrganizerFallback: boolean;
  updatedAt: Date;
}): UserMenuDefaultPreference {
  return {
    userKey: record.userKey,
    menuId: record.menuId,
    itemId: record.itemId,
    defaultComment: record.defaultComment,
    allowOrganizerFallback: record.allowOrganizerFallback,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function normalizeDefaultComment(input: string | null | undefined): string | null {
  if (input === undefined || input === null) {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_DEFAULT_COMMENT_LENGTH) {
    throw Object.assign(new Error('Default meal comment must be 200 characters or fewer'), {
      statusCode: 400,
    });
  }

  return trimmed;
}

export async function listUserMenuDefaultPreferences(
  userKeyInput: string,
): Promise<UserMenuDefaultPreference[]> {
  const userKey = normalizeUserKey(userKeyInput);
  const records = await prisma.userMenuDefaultPreference.findMany({
    where: { userKey },
    orderBy: { updatedAt: 'desc' },
  });

  return records.map(formatPreference);
}

export async function upsertUserMenuDefaultPreference(
  userKeyInput: string,
  menuId: string,
  itemId: string | null,
  defaultCommentInput: string | null | undefined,
  allowOrganizerFallback: boolean,
): Promise<UserMenuDefaultPreference> {
  const userKey = normalizeUserKey(userKeyInput);
  const defaultComment = normalizeDefaultComment(defaultCommentInput);

  if (typeof allowOrganizerFallback !== 'boolean') {
    throw Object.assign(new Error('Allow organizer fallback flag must be boolean'), {
      statusCode: 400,
    });
  }

  const menu = await prisma.menu.findUnique({ where: { id: menuId } });
  if (!menu) {
    throw Object.assign(new Error('Menu not found'), { statusCode: 404 });
  }

  if (itemId === null) {
    if (allowOrganizerFallback) {
      throw Object.assign(
        new Error('Default meal is required before organizer fallback can be enabled'),
        { statusCode: 400 },
      );
    }

    await prisma.userMenuDefaultPreference.deleteMany({
      where: { userKey, menuId },
    });

    return {
      userKey,
      menuId,
      itemId: null,
      defaultComment: null,
      allowOrganizerFallback: false,
      updatedAt: new Date().toISOString(),
    };
  }

  const item = await prisma.menuItem.findUnique({ where: { id: itemId } });
  if (!item) {
    throw Object.assign(new Error('Menu item not found'), { statusCode: 404 });
  }
  if (item.menuId !== menuId) {
    throw Object.assign(new Error('Menu item does not belong to the selected menu'), {
      statusCode: 400,
    });
  }

  const record = await prisma.userMenuDefaultPreference.upsert({
    where: {
      userKey_menuId: { userKey, menuId },
    },
    create: {
      userKey,
      menuId,
      itemId,
      defaultComment,
      allowOrganizerFallback,
    },
    update: {
      itemId,
      defaultComment,
      allowOrganizerFallback,
    },
  });

  return formatPreference(record);
}
