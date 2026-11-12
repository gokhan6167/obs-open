'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiList } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Drawer,
  Alert,
  Skeleton,
  SkeletonStats,
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

interface Survey {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  isActive: boolean;
  responseCount: number;
  targetCount: number | null;
  createdAt: string;
}

interface ResponseSummary {
  total: number;
  target: number | null;
  completionRate: number | null;
  items?: { label: string; value: number }[];
}

export default function Degerlendirme(): React.ReactElement {
  const [all, setAll] = useState<Survey[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Cevap özeti paneli
  const [detail, setDetail] = useState<Survey | null>(null);
  const [summary, setSummary] = useState<ResponseSummary | null>(null);
  const [summaryErr, setSummaryErr] = useState('');

  const load = useCallback(async () => {
    setAll(await apiList<Survey>('/surveys'));
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const rows = useMemo(() => all.filter((s) => s.kind === 'degerlendirme'), [all]);

  const openDetail = useCallback(async (s: Survey) => {
    setDetail(s);
    setSummary(null);
    setSummaryErr('');
    try {
      setSummary(await api<ResponseSummary>(`/surveys/${s.id}/responses`));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Cevap özeti alınamadı';
      setSummaryErr(msg);
      toast('Cevap özeti alınamadı', { tone: 'err', body: msg });
    }
  }, []);

  const stats = useMemo(() => {
    const active = rows.filter((s) => s.isActive).length;
    const totalResponses = rows.reduce((n, s) => n + (s.responseCount ?? 0), 0);
    return { total: rows.length, active, totalResponses };
  }, [rows]);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Değerlendirme Formları"
        sub="Öğretim elemanı değerlendirme anketlerinin yönetimi; cevap durumu ve özetleri."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam form', value: stats.total, icon: 'grade' },
            {
              label: 'Aktif',
              value: stats.active,
              icon: 'checkCircle',
              tone: stats.active > 0 ? 'ok' : undefined,
            },
            { label: 'Toplam cevap', value: stats.totalResponses, icon: 'users' },
          ]}
        />
      )}

      <Card
        title="Değerlendirme Formları"
        icon="grade"
        hint="Cevap özetini görmek için satırdaki düğmeyi kullanın."
      >
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Survey>
            rows={rows}
            search
            csv
            csvName="oidb-degerlendirme"
            empty={
              <EmptyState
                icon="grade"
                title="Henüz değerlendirme formu yok"
                sub={
                  <>
                    Değerlendirme formları{' '}
                    <Link href="/oidb/anketler">Anketler ekranından</Link> oluşturulur.
                  </>
                }
              />
            }
            columns={[
              {
                key: 'title',
                header: 'Başlık',
                sortable: true,
                value: (s) => s.title,
                render: (s) => (
                  <div>
                    <b>{s.title}</b>
                    {s.description && <div className="meta">{s.description}</div>}
                  </div>
                ),
              },
              {
                key: 'isActive',
                header: 'Durum',
                sortable: true,
                value: (s) => (s.isActive ? 'aktif' : 'pasif'),
                render: (s) => (
                  <Badge tone={s.isActive ? 'ok' : 'muted'}>{s.isActive ? 'aktif' : 'pasif'}</Badge>
                ),
              },
              {
                key: 'responseCount',
                header: 'Cevap',
                sortable: true,
                num: true,
                value: (s) => s.responseCount ?? 0,
                render: (s) => (
                  <span>
                    {s.responseCount ?? 0}
                    {s.targetCount != null && <span className="muted"> / {s.targetCount}</span>}
                  </span>
                ),
              },
              {
                key: 'createdAt',
                header: 'Oluşturma',
                sortable: true,
                value: (s) => s.createdAt,
                render: (s) => fmtDate(s.createdAt),
              },
              {
                key: 'action',
                header: '',
                sortable: false,
                render: (s) => (
                  <Button variant="subtle" sm icon="eye" onClick={() => openDetail(s)}>
                    Cevap Özeti
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Cevap özeti */}
      <Drawer
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail ? `Cevap Özeti · ${detail.title}` : undefined}
      >
        {detail && (
          <>
            <p className="hint">
              Değerlendirme · {fmtDate(detail.createdAt)} · {detail.isActive ? 'aktif' : 'pasif'}
            </p>

            {summaryErr ? (
              <Alert tone="err">{summaryErr}</Alert>
            ) : !summary ? (
              <Skeleton lines={4} />
            ) : (
              <>
                <StatGrid
                  stats={[
                    { label: 'Toplam cevap', value: summary.total, icon: 'users' },
                    ...(summary.target != null
                      ? [{ label: 'Hedef', value: summary.target, icon: 'inbox' } as const]
                      : []),
                    ...(summary.completionRate != null
                      ? [
                          {
                            label: 'Tamamlanma',
                            value: `%${summary.completionRate}`,
                            icon: 'checkCircle',
                          } as const,
                        ]
                      : []),
                  ]}
                />

                {summary.items && summary.items.length > 0 ? (
                  <Card title="Dağılım" icon="grade">
                    <div className="col" style={{ gap: 10 }}>
                      {summary.items.map((it) => (
                        <div
                          key={it.label}
                          className="row"
                          style={{ justifyContent: 'space-between', fontSize: 12.5 }}
                        >
                          <span>{it.label}</span>
                          <span className="muted">{it.value}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : (
                  summary.total === 0 && (
                    <EmptyState
                      icon="inbox"
                      title="Henüz cevap yok"
                      sub="Bu değerlendirme formuna gelen cevap bulunmuyor."
                    />
                  )
                )}
              </>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
