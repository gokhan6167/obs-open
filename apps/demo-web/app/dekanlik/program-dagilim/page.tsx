'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Alert,
  Skeleton,
  SkeletonStats,
  Segmented,
  Badge,
  EmptyState,
} from '@/app/ui';

interface ProgRow {
  program: string;
  count: number;
}

type SortKey = 'count' | 'name';

export default function ProgramDagilim(): React.ReactElement {
  const [progs, setProgs] = useState<ProgRow[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('count');

  useEffect(() => {
    api<ProgRow[]>('/reports/students-by-program')
      .then((p) => setProgs(p))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  const total = progs.reduce((s, p) => s + p.count, 0);
  const max = progs.reduce((m, p) => Math.max(m, p.count), 0) || 1;
  const avg = progs.length > 0 ? total / progs.length : 0;
  const median = useMemo(() => {
    if (progs.length === 0) return 0;
    const s = [...progs].map((p) => p.count).sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid]! : ((s[mid - 1]! + s[mid]!) / 2);
  }, [progs]);

  const view = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    const filtered = needle
      ? progs.filter((p) => p.program.toLocaleLowerCase('tr').includes(needle))
      : progs;
    return [...filtered].sort((a, b) =>
      sort === 'count' ? b.count - a.count : a.program.localeCompare(b.program, 'tr'),
    );
  }, [progs, q, sort]);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Program Dağılımı"
        sub="Fakülte programlarının öğrenci sayılarına göre karşılaştırmalı görünümü. Kontenjan planlaması ve kaynak dağıtımında referans alınır."
      />

      {loading ? (
        <SkeletonStats n={5} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Program Sayısı', value: progs.length, icon: 'layers' },
            { label: 'Toplam Öğrenci', value: total, icon: 'users' },
            { label: 'Program Ortalaması', value: avg.toFixed(0), icon: 'chart' },
            { label: 'Medyan', value: median.toFixed(0), icon: 'activity' },
            { label: 'En Kalabalık Program', value: max, icon: 'arrowUp' },
          ]}
        />
      )}

      <Card
        title="Karşılaştırmalı Çubuk Grafik"
        icon="chart"
        hint={
          loading ? undefined : (
            <>
              Ortalamanın (%{avg.toFixed(0)} öğrenci) üzerindeki programlar vurgulanmıştır.
              {q.trim() && view.length !== progs.length ? (
                <>
                  {' '}
                  Filtre: <b>{view.length}</b> program.
                </>
              ) : null}
            </>
          )
        }
      >
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <input
                  placeholder="Program ara…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Segmented<SortKey>
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'count', label: 'Öğrenci sayısı' },
                  { value: 'name', label: 'Program adı' },
                ]}
              />
            </div>
            {progs.length === 0 ? (
              <EmptyState
                icon="chart"
                title="Program verisi bulunamadı"
                sub="Henüz kayıtlı öğrenci dağılımı yok."
              />
            ) : view.length === 0 ? (
              <EmptyState
                icon="search"
                title={`“${q}” ile eşleşen program yok`}
                sub="Arama terimini değiştirin."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {view.map((p) => {
                  const aboveAvg = p.count >= avg;
                  return (
                    <div key={p.program}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                          fontSize: 13,
                          gap: 8,
                        }}
                      >
                        <span className="row" style={{ gap: 8 }}>
                          <b>{p.program}</b>
                          {aboveAvg && (
                            <Badge tone="info" noDot>
                              ort. üstü
                            </Badge>
                          )}
                        </span>
                        <span className="muted">
                          {p.count} öğrenci · %
                          {total > 0 ? ((p.count / total) * 100).toFixed(1) : '0'}
                        </span>
                      </div>
                      <div
                        style={{
                          background: 'var(--line)',
                          borderRadius: 6,
                          height: 16,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            background: aboveAvg ? 'var(--accent)' : 'var(--muted)',
                            height: 16,
                            borderRadius: 6,
                            width: `${(p.count / max) * 100}%`,
                            minWidth: p.count > 0 ? 8 : 0,
                            transition: 'width .3s',
                          }}
                          aria-label={`${p.count} öğrenci`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
