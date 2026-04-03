import { beforeEach, describe, expect, it } from 'vitest';
import {
  createPasswordHash,
  generateRandomPassword,
  normalizeEmail,
  verifyPassword,
} from '../../src/server/services/localAuth.js';

describe('local auth helpers', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = '12345678901234567890123456789012';
  });

  it('normalizes email to lowercase', () => {
    expect(normalizeEmail(' Alice.Example@Company.COM ')).toBe('alice.example@company.com');
  });

  it('hashes and verifies passwords', async () => {
    const hash = await createPasswordHash('Secret#1234');
    await expect(verifyPassword('Secret#1234', hash)).resolves.toBe(true);
    await expect(verifyPassword('WrongPassword', hash)).resolves.toBe(false);
  });

  it('generates random passwords in expected bounds', () => {
    const generated = generateRandomPassword(18);
    expect(generated.length).toBe(18);
    expect(generateRandomPassword(5).length).toBe(12);
    expect(generateRandomPassword(500).length).toBe(64);
  });
});

