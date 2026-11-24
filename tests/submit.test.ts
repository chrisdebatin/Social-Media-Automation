import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSubmitKey, submitEnabled } from '../lib/submitKey';

afterEach(() => vi.unstubAllEnvs());

describe('submission link key', () => {
  it('is disabled without a long enough SUBMIT_KEY', () => {
    vi.stubEnv('SUBMIT_KEY', '');
    expect(submitEnabled()).toBe(false);
    expect(checkSubmitKey('')).toBe(false);
    vi.stubEnv('SUBMIT_KEY', 'kurz');
    expect(submitEnabled()).toBe(false);
    expect(checkSubmitKey('kurz')).toBe(false);
  });
  it('accepts only the exact key', () => {
    vi.stubEnv('SUBMIT_KEY', 'pflegeunion-2026-xyz');
    expect(checkSubmitKey('pflegeunion-2026-xyz')).toBe(true);
    expect(checkSubmitKey('pflegeunion-2026-xy')).toBe(false);
    expect(checkSubmitKey(null)).toBe(false);
  });
});
