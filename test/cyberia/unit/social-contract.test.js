import { describe, expect, it } from 'vitest';
import { cleanStatusNote, statusNoteLength, validStatusNote } from '../../../src/api/cyberia-social/social-contract.js';
import { CyberiaSocialProfileSchema } from '../../../src/api/cyberia-social-profile/cyberia-social-profile.model.js';

describe('status note Unicode contract', () => {
  it.each([
    ['', 0],
    ['🌲', 1],
    ['e\u0301', 2],
    ['👩‍👩‍👧‍👦', 7],
    ['🇨🇱', 2],
  ])('counts scalar values in %s', (text, length) => {
    expect(statusNoteLength(text)).toBe(length);
    expect(validStatusNote(text)).toBe(true);
  });

  it('accepts 80 supplementary code points and rejects 81', () => {
    expect(validStatusNote('🌲'.repeat(80))).toBe(true);
    expect(validStatusNote('🌲'.repeat(81))).toBe(false);
    expect(validStatusNote('e\u0301'.repeat(40))).toBe(true);
    expect(validStatusNote('e\u0301'.repeat(41))).toBe(false);
    expect(validStatusNote('\ud800')).toBe(false);
    expect(validStatusNote(null)).toBe(false);
  });

  it('cleans controls and spaces without breaking emoji joiners', () => {
    expect(cleanStatusNote(' \tOut\n farming\u0007\u200b  👩‍👧 ')).toBe('Out farming 👩‍👧');
  });

  it('uses the domain validator in the persistence schema', () => {
    const validators = CyberiaSocialProfileSchema.path('note').validators;
    expect(validators.some(({ validator }) => validator === validStatusNote)).toBe(true);
    expect(CyberiaSocialProfileSchema.path('user').options.unique).toBe(true);
  });
});
