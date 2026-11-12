/**
 * Göç eşleme motoru iskeleti (M11 tohumu, Faz 8'de olgunlaşır). Kaynak OİS
 * formatı bilinmediği için eşleme KODDA DEĞİL, konfigürasyonda (YAML/JSON):
 * kolon adları, dönüşümler, zorunluluk. Eksik/geçersiz satır karantinaya düşer.
 *
 * Saf ve test edilebilir; DB/dosya bağımlılığı yok. Yükleme + mutabakat +
 * staging şeması Faz 8'de bunun üstüne inşa edilir.
 */
export type SourceRow = Record<string, unknown>;

export type TransformName = 'trim' | 'upper' | 'lower' | 'int' | 'nullIfEmpty';

export interface FieldMapping {
  /** Hedef alan adı. */
  target: string;
  /** Kaynak kolon adı. `const` verilmişse yok sayılır. */
  source?: string;
  /** Sabit değer (source yerine). */
  const?: string | number | boolean | null;
  /** Sıralı uygulanacak dönüşümler. */
  transforms?: TransformName[];
  /** Eksik/boşsa satır karantinaya. */
  required?: boolean;
}

export interface MappingConfig {
  /** Hedef varlık (ör. 'student'). */
  target: string;
  fields: FieldMapping[];
}

export interface MappingResult {
  ok: boolean;
  record: Record<string, unknown>;
  /** Karantina sebepleri (ok=false ise dolu). */
  errors: string[];
}

function applyTransform(value: unknown, t: TransformName): unknown {
  switch (t) {
    case 'trim':
      return typeof value === 'string' ? value.trim() : value;
    case 'upper':
      return typeof value === 'string' ? value.toUpperCase() : value;
    case 'lower':
      return typeof value === 'string' ? value.toLowerCase() : value;
    case 'int': {
      const n = Number.parseInt(String(value), 10);
      return Number.isNaN(n) ? null : n;
    }
    case 'nullIfEmpty':
      return value === '' ? null : value;
  }
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** Tek kaynak satırını config'e göre hedef kayda dönüştürür. */
export function applyMapping(config: MappingConfig, row: SourceRow): MappingResult {
  const record: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const field of config.fields) {
    let value: unknown = field.const !== undefined ? field.const : row[field.source ?? field.target];
    for (const t of field.transforms ?? []) {
      value = applyTransform(value, t);
    }
    if (field.required && isEmpty(value)) {
      errors.push(`zorunlu alan eksik: ${field.target}`);
    }
    record[field.target] = value;
  }

  return { ok: errors.length === 0, record, errors };
}
