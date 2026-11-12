'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Alert,
  Skeleton,
  SkeletonStats,
  EmptyState,
  fmtDate,
} from '@/app/ui';

interface ScaleBand {
  min: number;
  letter: string;
  coef: number;
}
interface ActiveScale {
  code: string;
  name: string;
  evaluationType: 'absolute' | 'relative';
  bands: ScaleBand[];
}

interface GpaPolicyValue {
  repeatPolicy?: string;
  roundingDigits?: number;
  roundingMode?: string;
}
interface AcademicRulesValue {
  minEctsPerTerm?: number;
  maxEctsPerTerm?: number;
  gpaBoostThreshold?: number;
  maxEctsWithBoost?: number;
  maxAbsenceTheoryPct?: number;
  maxAbsencePracticePct?: number;
  minGraduationGpa?: number;
}
interface ParamItem {
  key: string;
  label: string;
  value: unknown;
  valueType: string;
  effectiveFrom: string;
  version: string;
}

// Ölçek bandlarını alt puan aralığı ile göstermek için üst sınırı türet.
interface ScaleRow extends ScaleBand {
  max: number | null;
  counts: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export default function NotSistemiPage(): React.ReactElement {
  const [scale, setScale] = useState<ActiveScale | null>(null);
  const [params, setParams] = useState<ParamItem[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<ActiveScale>('/grades/active-scale'),
      api<{ items: ParamItem[] }>('/portal/parameters'),
    ])
      .then(([s, p]) => {
        setScale(s);
        setParams(p.items ?? []);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, []);

  // Bandlar puana göre azalan; her bandın üst sınırı bir üst bandın alt sınırıdır.
  const scaleRows = useMemo<ScaleRow[]>(() => {
    if (!scale) return [];
    const sorted = [...scale.bands].sort((a, b) => b.min - a.min);
    return sorted.map((b, i) => ({
      ...b,
      max: i === 0 ? 100 : sorted[i - 1]!.min - 0.01,
      // Katsayısı olan (sayısal) harfler ortalamaya katılır; muaf/geçti gibi harfler katılmaz.
      counts: Number.isFinite(b.coef) && b.coef > 0,
    }));
  }, [scale]);

  const gpaPolicy = useMemo<(GpaPolicyValue & { effectiveFrom: string }) | null>(() => {
    const p = params.find((x) => x.valueType === 'gpa_policy');
    if (!p) return null;
    return { ...(p.value as GpaPolicyValue), effectiveFrom: p.effectiveFrom };
  }, [params]);

  const rules = useMemo<(AcademicRulesValue & { effectiveFrom: string }) | null>(() => {
    const p = params.find((x) => x.valueType === 'academic_rules');
    if (!p) return null;
    return { ...(p.value as AcademicRulesValue), effectiveFrom: p.effectiveFrom };
  }, [params]);

  const roundLabel: Record<string, string> = {
    'half-up': 'Yukarı yuvarla (0.5 üste)',
    'half-down': 'Aşağı yuvarla (0.5 alta)',
    'half-even': 'Bankacı yuvarlaması',
  };
  const repeatLabel: Record<string, string> = {
    last: 'Son not geçerli',
    best: 'En yüksek not geçerli',
    average: 'Ortalama alınır',
  };

  return (
    <>
      <PageHeader
        title="Not Sistemi & Harf Notu"
        sub="Aktif harf notu ölçeği ve kurumun akademik kuralları (salt okunur)."
      />

      {err && <Alert tone="err">{err}</Alert>}

      <Card
        title="Aktif Harf Notu Ölçeği"
        icon="grade"
        hint={
          scale ? (
            <Badge tone="info" noDot>
              {scale.evaluationType === 'relative' ? 'Bağıl' : 'Mutlak'} · {scale.code}
            </Badge>
          ) : undefined
        }
      >
        {loading ? (
          <Skeleton lines={8} />
        ) : !scale || scaleRows.length === 0 ? (
          <EmptyState
            icon="grade"
            title="Aktif ölçek tanımlı değil"
            sub="Kurum için aktif bir harf notu ölçeği bulunamadı."
          />
        ) : (
          <DataTable<ScaleRow>
            rows={scaleRows}
            csv
            csvName="oidb-harf-olcegi"
            empty={<EmptyState icon="grade" title="Band yok" />}
            columns={[
              {
                key: 'letter',
                header: 'Harf',
                sortable: true,
                value: (r) => r.letter,
                render: (r) => <b>{r.letter}</b>,
              },
              {
                key: 'range',
                header: 'Puan aralığı',
                num: true,
                value: (r) => r.min,
                render: (r) =>
                  r.max === null ? `${r.min} +` : `${r.min} – ${r.max.toFixed(2)}`,
              },
              {
                key: 'coef',
                header: '4’lük karşılık',
                sortable: true,
                num: true,
                value: (r) => r.coef,
                render: (r) => r.coef.toFixed(2),
              },
              {
                key: 'counts',
                header: 'Ortalamaya katılır',
                sortable: true,
                value: (r) => (r.counts ? 1 : 0),
                render: (r) =>
                  r.counts ? (
                    <Badge tone="ok">Evet</Badge>
                  ) : (
                    <Badge tone="muted">Hayır</Badge>
                  ),
              },
            ]}
          />
        )}
      </Card>

      <Card title="Akademik Kurallar" icon="book" hint="AKTS limitleri ve devamsızlık eşikleri">
        {loading ? (
          <SkeletonStats n={4} />
        ) : rules ? (
          <StatGrid
            stats={[
              {
                label: 'Dönemlik asgari AKTS',
                value: num(rules.minEctsPerTerm) ?? '—',
                icon: 'layers',
              },
              {
                label: 'Dönemlik azami AKTS',
                value: num(rules.maxEctsPerTerm) ?? '—',
                icon: 'layers',
              },
              {
                label: 'Devamsızlık — Teorik',
                value: num(rules.maxAbsenceTheoryPct) != null ? `%${rules.maxAbsenceTheoryPct}` : '—',
                icon: 'clock',
                tone: 'warn',
              },
              {
                label: 'Devamsızlık — Uygulama',
                value:
                  num(rules.maxAbsencePracticePct) != null ? `%${rules.maxAbsencePracticePct}` : '—',
                icon: 'clock',
                tone: 'warn',
              },
              {
                label: 'Asgari mezuniyet GNO',
                value: num(rules.minGraduationGpa) != null ? rules.minGraduationGpa!.toFixed(2) : '—',
                icon: 'award',
                tone: 'ok',
              },
              ...(num(rules.gpaBoostThreshold) != null
                ? [
                    {
                      label: `GNO ≥ ${rules.gpaBoostThreshold!.toFixed(2)} ise azami AKTS`,
                      value: num(rules.maxEctsWithBoost) ?? '—',
                      icon: 'target' as const,
                    },
                  ]
                : []),
            ]}
          />
        ) : (
          <EmptyState
            icon="book"
            title="Akademik kural seti tanımlı değil"
            sub="Kurum için geçerli bir kural seti bulunamadı."
          />
        )}
        {rules && (
          <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
            Yürürlük: {fmtDate(rules.effectiveFrom)}
          </p>
        )}
      </Card>

      <Card title="GNO Politikası" icon="chart">
        {loading ? (
          <SkeletonStats n={3} />
        ) : gpaPolicy ? (
          <>
            <StatGrid
              stats={[
                {
                  label: 'Tekrar politikası',
                  value: gpaPolicy.repeatPolicy
                    ? (repeatLabel[gpaPolicy.repeatPolicy] ?? gpaPolicy.repeatPolicy)
                    : '—',
                  icon: 'refresh',
                },
                {
                  label: 'Yuvarlama basamağı',
                  value: num(gpaPolicy.roundingDigits) ?? '—',
                  icon: 'target',
                },
                {
                  label: 'Yuvarlama yöntemi',
                  value: gpaPolicy.roundingMode
                    ? (roundLabel[gpaPolicy.roundingMode] ?? gpaPolicy.roundingMode)
                    : '—',
                  icon: 'shield',
                },
              ]}
            />
            <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Yürürlük: {fmtDate(gpaPolicy.effectiveFrom)}
            </p>
          </>
        ) : (
          <EmptyState icon="chart" title="GNO politikası tanımlı değil" />
        )}
      </Card>
    </>
  );
}
