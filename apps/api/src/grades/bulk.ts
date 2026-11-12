/**
 * Toplu not girişi satır doğrulama — saf (M4). Excel/CSV'den gelen satırları
 * doğrular; hatalı satırlar rapora (index + sebep) düşer, geçerliler işlenir.
 * "Hatalı satır raporu" mantığı burada; xlsx okuma ayrı adaptörde (excel.service).
 */
export interface RawGradeRow {
  studentNo: string;
  score: unknown;
}

export interface ValidGradeRow {
  studentNo: string;
  score: number;
}

export interface BulkRowError {
  index: number;
  studentNo: string;
  reason: string;
}

export interface BulkParseResult {
  valid: ValidGradeRow[];
  errors: BulkRowError[];
}

export interface ScoreBounds {
  min: number;
  max: number;
}

export function validateGradeRows(
  rows: readonly RawGradeRow[],
  bounds: ScoreBounds,
): BulkParseResult {
  const valid: ValidGradeRow[] = [];
  const errors: BulkRowError[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const studentNo = String(row.studentNo ?? '').trim();
    if (!studentNo) {
      errors.push({ index, studentNo, reason: 'öğrenci no boş' });
      return;
    }
    if (seen.has(studentNo)) {
      errors.push({ index, studentNo, reason: 'tekrarlı öğrenci no' });
      return;
    }
    const score = typeof row.score === 'number' ? row.score : Number(row.score);
    if (!Number.isFinite(score)) {
      errors.push({ index, studentNo, reason: 'puan sayısal değil' });
      return;
    }
    if (score < bounds.min || score > bounds.max) {
      errors.push({ index, studentNo, reason: `puan ${bounds.min}-${bounds.max} dışında` });
      return;
    }
    seen.add(studentNo);
    valid.push({ studentNo, score });
  });

  return { valid, errors };
}
