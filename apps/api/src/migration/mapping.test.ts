import { describe, expect, it } from 'vitest';
import { applyMapping, type MappingConfig } from './mapping.js';

// Örnek eşleme: OİS'ten öğrenci (kolon adları farklı, dönüşümler gerekli).
const config: MappingConfig = {
  target: 'student',
  fields: [
    { target: 'studentNo', source: 'OGRENCI_NO', transforms: ['trim'], required: true },
    { target: 'email', source: 'EPOSTA', transforms: ['trim', 'lower'] },
    { target: 'entryYear', source: 'GIRIS_YILI', transforms: ['int'], required: true },
    { target: 'status', const: 'aktif' },
  ],
};

describe('applyMapping', () => {
  it('geçerli satırı hedef kayda dönüştürür', () => {
    const res = applyMapping(config, {
      OGRENCI_NO: ' 2023001 ',
      EPOSTA: ' Ali@EXAMPLE.EDU ',
      GIRIS_YILI: '2023',
    });
    expect(res.ok).toBe(true);
    expect(res.record).toEqual({
      studentNo: '2023001',
      email: 'ali@example.edu',
      entryYear: 2023,
      status: 'aktif',
    });
  });

  it('zorunlu alan eksikse karantina (ok=false + sebep)', () => {
    const res = applyMapping(config, { OGRENCI_NO: '', GIRIS_YILI: 'abc' });
    expect(res.ok).toBe(false);
    expect(res.errors).toContain('zorunlu alan eksik: studentNo');
    // 'abc' -> int -> null -> zorunlu eksik
    expect(res.errors).toContain('zorunlu alan eksik: entryYear');
  });

  it('sabit (const) değer kaynaktan bağımsız yazılır', () => {
    const res = applyMapping(config, { OGRENCI_NO: '1', GIRIS_YILI: '2020' });
    expect(res.record.status).toBe('aktif');
  });

  it('source yoksa target adını kolon olarak kullanır', () => {
    const cfg: MappingConfig = { target: 't', fields: [{ target: 'ad', transforms: ['upper'] }] };
    expect(applyMapping(cfg, { ad: 'zeynep' }).record.ad).toBe('ZEYNEP');
  });

  it('nullIfEmpty boş string i null yapar', () => {
    const cfg: MappingConfig = { target: 't', fields: [{ target: 'x', transforms: ['nullIfEmpty'] }] };
    expect(applyMapping(cfg, { x: '' }).record.x).toBeNull();
  });
});
