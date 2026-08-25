import { describe, expect, it } from 'vitest';
import { MAPPING_HEADERS, JOIN_HEADERS } from '@/lib/excel/sampleTemplate';
import { detectColumns, CONFIDENCE_AUTO_ACCEPT } from '@/lib/excel/columnDetection';
import { MAPPING_FIELD_ALIASES, JOIN_FIELD_ALIASES } from '@/lib/excel/aliases';
import { REQUIRED_MAPPING_FIELDS, REQUIRED_JOIN_FIELDS } from '@/types/columnMapping';

describe('sample template headers', () => {
  it('every mapping-sheet header auto-detects at or above the auto-accept confidence threshold', () => {
    // The sample template intentionally represents a normal table-to-table (L2) mapping doc, so
    // it has no file-location/file-name columns -- those two fields are optional (L1-only) and
    // are expected to have no match here.
    const OPTIONAL_FILE_FIELDS = new Set(['sourceFileLocation', 'sourceFileName']);
    const detected = detectColumns(MAPPING_HEADERS, MAPPING_FIELD_ALIASES).filter(
      (c) => !OPTIONAL_FILE_FIELDS.has(c.field)
    );
    for (const column of detected) {
      expect(column.matchedHeader, `field "${column.field}" should have matched a header`).not.toBeNull();
      expect(
        column.confidence,
        `field "${column.field}" matched "${column.matchedHeader}" with confidence ${column.confidence}`
      ).toBeGreaterThanOrEqual(CONFIDENCE_AUTO_ACCEPT);
    }
  });

  it('every joins-sheet header auto-detects at or above the auto-accept confidence threshold', () => {
    const detected = detectColumns(JOIN_HEADERS, JOIN_FIELD_ALIASES);
    for (const column of detected) {
      expect(column.matchedHeader, `field "${column.field}" should have matched a header`).not.toBeNull();
      expect(column.confidence).toBeGreaterThanOrEqual(CONFIDENCE_AUTO_ACCEPT);
    }
  });

  it('covers every required mapping and join field', () => {
    const detected = detectColumns(MAPPING_HEADERS, MAPPING_FIELD_ALIASES);
    for (const field of REQUIRED_MAPPING_FIELDS) {
      expect(detected.find((c) => c.field === field)?.matchedHeader).not.toBeNull();
    }
    const detectedJoins = detectColumns(JOIN_HEADERS, JOIN_FIELD_ALIASES);
    for (const field of REQUIRED_JOIN_FIELDS) {
      expect(detectedJoins.find((c) => c.field === field)?.matchedHeader).not.toBeNull();
    }
  });
});
