import { FilesMetadataValueKind } from '@prisma/client';
import {
  normalizeAllowedValuesInput,
  parseAllowedValuesJson,
  validateMetadataValueForKey,
} from '../services/files-metadata-validation';

describe('files-metadata-validation', () => {
  describe('parseAllowedValuesJson', () => {
    it('dedupes and trims', () => {
      expect(parseAllowedValuesJson([' a ', 'a', 'b'])).toEqual(['a', 'b']);
    });

    it('returns empty for non-array', () => {
      expect(parseAllowedValuesJson(null)).toEqual([]);
    });
  });

  describe('normalizeAllowedValuesInput', () => {
    it('rejects non-array', () => {
      const r = normalizeAllowedValuesInput('x');
      expect(r.ok).toBe(false);
    });

    it('accepts valid list', () => {
      const r = normalizeAllowedValuesInput(['a', 'b']);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.values).toEqual(['a', 'b']);
    });
  });

  describe('validateMetadataValueForKey', () => {
    it('allows any value for free_text', () => {
      expect(
        validateMetadataValueForKey(
          { value_kind: FilesMetadataValueKind.free_text, allowed_values: [] },
          'anything',
        ),
      ).toEqual({ ok: true });
    });

    it('accepts value in predefined list', () => {
      expect(
        validateMetadataValueForKey(
          { value_kind: FilesMetadataValueKind.predefined_list, allowed_values: ['x', 'y'] },
          'y',
        ),
      ).toEqual({ ok: true });
    });

    it('rejects value not in predefined list', () => {
      const r = validateMetadataValueForKey(
        { value_kind: FilesMetadataValueKind.predefined_list, allowed_values: ['a'] },
        'b',
      );
      expect(r.ok).toBe(false);
    });
  });
});
