'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Alert,
  ProgressBar,
  toast,
} from '@/app/ui';

interface Program {
  id: string;
  code: string;
  name: string;
  level: string;
}
interface Outcome {
  id: string;
  code: string;
  textTr: string;
  textEn: string | null;
  tyycDimension: string | null;
}

const LEVEL_TYYC: Record<string, { tr: string; eqf: string }> = {
  onlisans: { tr: '5. Düzey', eqf: 'EQF 5' },
  lisans: { tr: '6. Düzey', eqf: 'EQF 6' },
  yukseklisans: { tr: '7. Düzey', eqf: 'EQF 7' },
  yuksek_lisans: { tr: '7. Düzey', eqf: 'EQF 7' },
  doktora: { tr: '8. Düzey', eqf: 'EQF 8' },
};

/** TYYÇ temel yeterlilik boyutları (Türkiye Yükseköğretim Yeterlilikler Çerçevesi). */
const TYYC_DIMENSIONS = [
  'Bilgi',
  'Beceri',
  'Bağımsız Çalışabilme',
  'Öğrenme Yetkinliği',
  'İletişim ve Sosyal',
  'Alana Özgü',
];

const TEXTAREA_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  resize: 'vertical',
};

interface FormState {
  id?: string;
  code: string;
  textTr: string;
  textEn: string;
  tyycDimension: string;
}
const EMPTY_FORM: FormState = { code: '', textTr: '', textEn: '', tyycDimension: '' };

export default function ProgramCiktilari(): React.ReactElement {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<Program | null>(null);

  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [oErr, setOErr] = useState('');
  const [oLoading, setOLoading] = useState(false);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  useEffect(() => {
    api<Program[]>('/programs')
      .then((p) => {
        setPrograms(p);
        setSel(p[0] ?? null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  const loadOutcomes = useCallback(async (programId: string) => {
    setOLoading(true);
    setOErr('');
    setOutcomes(null);
    try {
      const rows = await api<Outcome[]>(`/programs/${programId}/outcomes`);
      setOutcomes(rows);
    } catch (e) {
      setOErr(e instanceof Error ? e.message : 'Program çıktıları okunamadı');
    } finally {
      setOLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sel) void loadOutcomes(sel.id);
  }, [sel, loadOutcomes]);

  const save = useCallback(async () => {
    if (!sel || !form) return;
    if (!form.code.trim() || !form.textTr.trim()) {
      setFormErr('Kod ve Türkçe çıktı metni zorunludur.');
      return;
    }
    setSaving(true);
    setFormErr('');
    const isEdit = !!form.id;
    try {
      await api(`/programs/${sel.id}/outcomes`, {
        method: 'POST',
        body: {
          id: form.id,
          code: form.code.trim(),
          textTr: form.textTr.trim(),
          textEn: form.textEn.trim() || null,
          tyycDimension: form.tyycDimension || null,
        },
      });
      toast(isEdit ? 'Program çıktısı güncellendi' : 'Program çıktısı eklendi', { tone: 'ok' });
      setForm(null);
      await loadOutcomes(sel.id);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }, [sel, form, loadOutcomes]);

  const remove = useCallback(
    async (o: Outcome) => {
      if (!sel) return;
      if (!window.confirm(`${o.code} program çıktısı silinsin mi? Bu işlem geri alınamaz.`)) return;
      try {
        await api(`/programs/${sel.id}/outcomes`, {
          method: 'POST',
          body: { id: o.id, delete: true },
        });
        toast(`${o.code} silindi`, { tone: 'ok' });
        await loadOutcomes(sel.id);
      } catch (e) {
        setOErr(e instanceof Error ? e.message : 'Silinemedi');
      }
    },
    [sel, loadOutcomes],
  );

  const byDimension = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of outcomes ?? []) {
      const key = o.tyycDimension ?? '(atanmamış)';
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [outcomes]);
  const withEn = (outcomes ?? []).filter((o) => o.textEn && o.textEn.trim()).length;

  const coveredDims = useMemo(
    () => TYYC_DIMENSIONS.filter((d) => (byDimension.get(d) ?? 0) > 0).length,
    [byDimension],
  );
  const dimPct = Math.round((coveredDims / TYYC_DIMENSIONS.length) * 100);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Program Çıktıları (PÇ)"
        sub="Programın öğrenme çıktılarını (PÇ) tanımlayın ve TYYÇ yeterlilik boyutlarıyla eşleyin. Çıktı ekleme/güncelleme/silme işlemleri canlı olarak müfredat veritabanına yazılır."
      />

      <Card title="Program Seç" icon="filter">
        <div className="field">
          <label>Program</label>
          <select
            value={sel?.id ?? ''}
            onChange={(e) => {
              setForm(null);
              setSel(programs.find((p) => p.id === e.target.value) ?? null);
            }}
          >
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {sel && (
        <StatGrid
          stats={[
            { label: 'Tanımlı PÇ', value: outcomes?.length ?? '—', icon: 'target' },
            { label: 'TYYÇ Düzeyi', value: LEVEL_TYYC[sel.level]?.tr ?? '—', icon: 'layers' },
            { label: 'Avrupa YÇ (EQF)', value: LEVEL_TYYC[sel.level]?.eqf ?? '—', icon: 'shield' },
            {
              label: 'İngilizce Metinli',
              value: withEn,
              icon: 'fileText',
              tone: outcomes && outcomes.length > 0 && withEn < outcomes.length ? 'warn' : 'ok',
            },
          ]}
        />
      )}

      <Card
        title="Program Çıktıları"
        icon="target"
        actions={
          sel && !form ? (
            <Button
              variant="ok"
              sm
              icon="edit"
              onClick={() => setForm({ ...EMPTY_FORM, code: `PÇ-${(outcomes?.length ?? 0) + 1}` })}
            >
              Yeni PÇ
            </Button>
          ) : undefined
        }
      >
        {oErr && <Alert tone="err">{oErr}</Alert>}

        {oLoading ? (
          <Skeleton lines={5} />
        ) : outcomes && outcomes.length === 0 && !form ? (
          <EmptyState
            icon="target"
            title="Henüz program çıktısı yok"
            sub="Bu programa program çıktısı tanımlanmamış. İlk çıktıyı ekleyerek başlayın."
            action={
              <Button
                variant="ok"
                icon="edit"
                onClick={() => setForm({ ...EMPTY_FORM, code: 'PÇ-1' })}
              >
                Yeni PÇ
              </Button>
            }
          />
        ) : (
          outcomes &&
          outcomes.length > 0 && (
            <table style={{ marginTop: 4 }}>
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Kod</th>
                  <th>Çıktı (TR)</th>
                  <th>TYYÇ Boyutu</th>
                  <th style={{ width: 150 }}></th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <b>{o.code}</b>
                    </td>
                    <td>
                      {o.textTr}
                      {o.textEn && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          EN: {o.textEn}
                        </div>
                      )}
                    </td>
                    <td>
                      {o.tyycDimension ? (
                        <Badge tone="info">{o.tyycDimension}</Badge>
                      ) : (
                        <Badge tone="warn">atanmamış</Badge>
                      )}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        sm
                        icon="edit"
                        onClick={() =>
                          setForm({
                            id: o.id,
                            code: o.code,
                            textTr: o.textTr,
                            textEn: o.textEn ?? '',
                            tyycDimension: o.tyycDimension ?? '',
                          })
                        }
                      >
                        Düzenle
                      </Button>{' '}
                      <Button variant="danger" sm onClick={() => remove(o)}>
                        Sil
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </Card>

      {form && (
        <Card title={form.id ? 'Program Çıktısını Düzenle' : 'Yeni Program Çıktısı'} icon="edit">
          {formErr && <Alert tone="err">{formErr}</Alert>}
          <div className="row" style={{ gap: 8 }}>
            <div className="field" style={{ width: 140 }}>
              <label>Kod</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="PÇ-1"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>TYYÇ Boyutu</label>
              <select
                value={form.tyycDimension}
                onChange={(e) => setForm({ ...form, tyycDimension: e.target.value })}
              >
                <option value="">(atanmamış)</option>
                {TYYC_DIMENSIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Çıktı Metni (Türkçe)</label>
            <textarea
              value={form.textTr}
              onChange={(e) => setForm({ ...form, textTr: e.target.value })}
              rows={3}
              placeholder="Öğrenci, ... yetkinliğine sahip olur."
              style={TEXTAREA_STYLE}
            />
          </div>
          <div className="field">
            <label>Çıktı Metni (İngilizce — opsiyonel)</label>
            <textarea
              value={form.textEn}
              onChange={(e) => setForm({ ...form, textEn: e.target.value })}
              rows={2}
              placeholder="The student is able to ..."
              style={TEXTAREA_STYLE}
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="ok" disabled={saving} onClick={save}>
              {saving ? 'Kaydediliyor…' : form.id ? 'Güncelle' : 'Ekle'}
            </Button>
            <Button variant="ghost" disabled={saving} onClick={() => setForm(null)}>
              Vazgeç
            </Button>
          </div>
        </Card>
      )}

      {sel && outcomes && outcomes.length > 0 && (
        <Card
          title="TYYÇ Boyut Kapsaması"
          icon="chart"
          hint={`${sel.name} programının çıktılarının altı TYYÇ yeterlilik boyutuna dağılımı. Boş boyutlar akreditasyonda kapsam eksikliği olarak değerlendirilir.`}
        >
          <div style={{ marginBottom: 12 }}>
            <ProgressBar value={dimPct} tone={dimPct >= 100 ? undefined : dimPct >= 50 ? 'warn' : 'danger'} />
            <p className="hint" style={{ marginTop: 4 }}>
              {coveredDims}/{TYYC_DIMENSIONS.length} boyut kapsandı (%{dimPct})
            </p>
          </div>
          <table>
            <thead>
              <tr>
                <th>TYYÇ Boyutu</th>
                <th>Eşlenen PÇ</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {TYYC_DIMENSIONS.map((d) => {
                const n = byDimension.get(d) ?? 0;
                return (
                  <tr key={d}>
                    <td>{d}</td>
                    <td>{n}</td>
                    <td>
                      <Badge tone={n > 0 ? 'ok' : 'warn'}>{n > 0 ? 'Kapsandı' : 'Boş'}</Badge>
                    </td>
                  </tr>
                );
              })}
              {(byDimension.get('(atanmamış)') ?? 0) > 0 && (
                <tr>
                  <td className="muted">(atanmamış)</td>
                  <td>{byDimension.get('(atanmamış)')}</td>
                  <td>
                    <Badge tone="warn">boyut atanmalı</Badge>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
