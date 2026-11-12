'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Segmented,
  EmptyState,
  Alert,
  SkeletonStats,
  fmtDate,
} from '@/app/ui';

type ValueType = 'grade_bands' | 'gpa_policy' | 'academic_rules';
interface Param {
  key: string;
  label: string;
  value: unknown;
  valueType: ValueType;
  effectiveFrom: string | null;
  version: string;
}
interface ParamsResp {
  items: Param[];
}

const TYPE_TR: Record<ValueType, string> = {
  grade_bands: 'Harf Notu Ölçeği',
  gpa_policy: 'GNO Politikası',
  academic_rules: 'Akademik Kural Seti',
};

/** grade_bands değeri: [{grade, min, max, gpa}] benzeri diziyi tabloya döker. */
function GradeBands({ value }: { value: unknown }): React.ReactElement {
  const bands = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  if (bands.length === 0) return <span className="muted">Bant tanımı yok.</span>;
  const cols = Object.keys(bands[0]);
  return (
    <table>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {bands.map((b, i) => (
          <tr key={i}>
            {cols.map((c) => (
              <td key={c}>{String(b[c] ?? '')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function KeyVals({ value }: { value: unknown }): React.ReactElement {
  if (value == null || typeof value !== 'object') return <code>{JSON.stringify(value)}</code>;
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <table>
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <th style={{ width: 220 }}>{k}</th>
            <td>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type TypeFilter = 'all' | ValueType;

export default function Parametreler(): React.ReactElement {
  const [items, setItems] = useState<Param[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const r = await api<ParamsResp>('/portal/parameters');
    setItems(r.items);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<ValueType, number> = {
      grade_bands: 0,
      gpa_policy: 0,
      academic_rules: 0,
    };
    for (const it of items) c[it.valueType] += 1;
    return c;
  }, [items]);

  const activeCount = useMemo(() => items.filter((i) => i.version === 'aktif').length, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => typeFilter === 'all' || it.valueType === typeFilter);
  }, [items, typeFilter]);

  return (
    <>
      <PageHeader
        title="Sistem Parametreleri"
        sub="Harf ölçeği, GNO politikası ve akademik kural setleri — hangi dönemden geçerli olduğu (versiyon) ile birlikte."
      />

      {err && <Alert tone="err">{err}</Alert>}

      {!loaded ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Harf Ölçeği Sürümü', value: counts.grade_bands, icon: 'grade' },
            { label: 'GNO Politikası', value: counts.gpa_policy, icon: 'target' },
            { label: 'Kural Seti', value: counts.academic_rules, icon: 'shield' },
            { label: 'Aktif Sürüm', value: activeCount, icon: 'checkCircle', tone: 'ok' },
          ]}
        />
      )}

      <Card
        title="Parametre Sürümleri"
        icon="settings"
        hint={`${filtered.length} / ${items.length} sürüm gösteriliyor.`}
        actions={
          <Segmented
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'all', label: 'Tümü' },
              { value: 'grade_bands', label: 'Harf' },
              { value: 'gpa_policy', label: 'GNO' },
              { value: 'academic_rules', label: 'Kural' },
            ]}
          />
        }
      >
        {!loaded ? (
          <p className="muted">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <EmptyState icon="settings" title="Tanımlı parametre yok" sub="Bu kiracı için henüz sürümlenmiş parametre bulunmuyor." />
        ) : filtered.length === 0 ? (
          <EmptyState icon="filter" title="Filtreye uyan parametre yok" />
        ) : null}
      </Card>

      {loaded &&
        filtered.map((it, i) => (
          <Card
            key={`${it.key}-${i}`}
            title={it.label}
            icon={it.valueType === 'grade_bands' ? 'grade' : it.valueType === 'gpa_policy' ? 'target' : 'shield'}
            hint={
              <>
                Anahtar <code>{it.key}</code> · Geçerlilik başlangıcı:{' '}
                <b>{fmtDate(it.effectiveFrom)}</b>
              </>
            }
            actions={
              <>
                <Badge tone="muted">{TYPE_TR[it.valueType]}</Badge>
                <Badge tone={it.version === 'aktif' ? 'ok' : 'info'}>v: {it.version}</Badge>
              </>
            }
          >
            {it.valueType === 'grade_bands' ? (
              <GradeBands value={it.value} />
            ) : (
              <KeyVals value={it.value} />
            )}
          </Card>
        ))}

      <div className="info-box">
        <b>Versiyonlama:</b> Parametreler yerinde değiştirilmez; yeni bir <i>effectiveFrom</i> ile
        sürümlenir ve geçmiş sürümler denetim için saklanır. Böylece bir dönemde uygulanan harf
        ölçeği/GNO politikası geriye dönük olarak izlenebilir. Bu ekran{' '}
        <code>GET /portal/parameters</code> üzerinden tüm sürümleri ve hangisinin aktif olduğunu
        gösterir.
      </div>
    </>
  );
}
