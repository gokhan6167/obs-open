'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Alert,
  Skeleton,
  SkeletonStats,
  Drawer,
  EmptyState,
  Segmented,
  toast,
  fmtDate,
} from '@/app/ui';

interface Cap {
  id: string;
  type: string;
  status: string;
  gpaSnapshot: number | string | null;
  decisionReason: string | null;
  createdAt: string;
  studentNo: string;
  targetProgram: string;
}

const TYPE_TR: Record<string, string> = { cap: 'ÇAP', yandal: 'Yandal' };
const STATUS_TR: Record<string, string> = {
  submitted: 'Başvuruldu',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};
const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  submitted: 'warn',
  in_review: 'warn',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'muted',
};
const OPEN = new Set(['submitted', 'in_review']);
const NEXT: { value: string; label: string; variant: 'ghost' | 'ok' | 'danger' }[] = [
  { value: 'in_review', label: 'İncele', variant: 'ghost' },
  { value: 'approved', label: 'Onayla', variant: 'ok' },
  { value: 'rejected', label: 'Reddet', variant: 'danger' },
];

function fmtGpa(v: Cap['gpaSnapshot']): string {
  if (v == null) return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

const FLOW = ['submitted', 'in_review', 'approved'] as const;
// ÇAP/Yandal başvurusunda önerilen asgari GNO eşiği (bilgilendirme; asıl kural sunucuda).
const GPA_THRESHOLD = 2.72;

/** Durum makinesi ilerlemesini yatay bir zaman çizelgesi olarak gösterir. */
function StatusTimeline({ status }: { status: string }): React.ReactElement {
  const idx = FLOW.indexOf(status as (typeof FLOW)[number]);
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 0, flexWrap: 'wrap' }}>
      {FLOW.map((s, i) => {
        const done = idx >= 0 && i <= idx;
        return (
          <Fragment key={s}>
            <span style={{ opacity: done ? 1 : 0.45 }}>
              <Badge tone={done && i === idx ? 'ok' : 'muted'}>{STATUS_TR[s] ?? s}</Badge>
            </span>
            {i < FLOW.length - 1 && <span className="muted">→</span>}
          </Fragment>
        );
      })}
      {status === 'rejected' && (
        <>
          <span className="muted">·</span>
          <Badge tone="danger">{STATUS_TR.rejected}</Badge>
        </>
      )}
    </div>
  );
}

export default function CapKuyrugu(): React.ReactElement {
  const [apps, setApps] = useState<Cap[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [detail, setDetail] = useState<Cap | null>(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setApps(await api<Cap[]>('/portal/double-major'));
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(() => {
    return apps.filter(
      (a) => (!typeFilter || a.type === typeFilter) && (scope === 'all' || OPEN.has(a.status)),
    );
  }, [apps, typeFilter, scope]);

  async function transition(a: Cap, to: string): Promise<void> {
    let reason: string | undefined;
    if (to === 'rejected') {
      const input = window.prompt('Red gerekçesi:', '');
      if (input === null) return;
      reason = input || undefined;
    }
    setBusyId(a.id);
    setErr('');
    try {
      await api(`/double-major/${a.id}/transition`, { method: 'POST', body: { to, reason } });
      toast('Başvuru güncellendi', {
        tone: to === 'rejected' ? 'err' : 'ok',
        body: `${a.studentNo} · ${TYPE_TR[a.type] ?? a.type} → ${STATUS_TR[to] ?? to}`,
      });
      await load();
      setDetail((d) => (d && d.id === a.id ? { ...d, status: to, decisionReason: reason ?? d.decisionReason } : d));
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Geçiş başarısız';
      setErr(m);
      toast('Geçiş başarısız', { tone: 'err', body: m });
    } finally {
      setBusyId('');
    }
  }

  const counts = useMemo(
    () => ({
      open: apps.filter((a) => OPEN.has(a.status)).length,
      cap: apps.filter((a) => a.type === 'cap').length,
      yandal: apps.filter((a) => a.type === 'yandal').length,
    }),
    [apps],
  );

  const belowThreshold = (a: Cap): boolean => {
    const n = a.gpaSnapshot == null ? null : Number(a.gpaSnapshot);
    return n != null && Number.isFinite(n) && n < GPA_THRESHOLD;
  };

  return (
    <>
      <PageHeader
        title="ÇAP / Yandal Kuyruğu"
        sub="Çift anadal ve yandal başvuruları. GNO anlık görüntüsüyle gerekçeli geçiş."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Bekleyen başvuru',
              value: counts.open,
              icon: 'inbox',
              tone: counts.open > 0 ? 'warn' : undefined,
            },
            { label: 'Toplam ÇAP', value: counts.cap, icon: 'layers' },
            { label: 'Toplam Yandal', value: counts.yandal, icon: 'grade' },
          ]}
        />
      )}

      <Card title="Başvurular" icon="layers">
        {err && <Alert tone="err">{err}</Alert>}
        <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="field">
            <label>Kapsam</label>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'open', label: 'Sadece açık' },
                { value: 'all', label: 'Tümü' },
              ]}
            />
          </div>
          <div className="field">
            <label>Tip filtresi</label>
            <Segmented
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: '', label: 'Tümü' },
                { value: 'cap', label: 'ÇAP' },
                { value: 'yandal', label: 'Yandal' },
              ]}
            />
          </div>
        </div>
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Cap>
            rows={filtered}
            search
            csv
            csvName="oidb-cap-yandal"
            empty={
              <EmptyState
                icon="checkCircle"
                title="Bu filtreyle bekleyen başvuru yok"
                sub="Kapsamı 'Tümü' yaparak sonuçlanmış başvuruları da görebilirsiniz."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                sortable: true,
                value: (a) => a.studentNo,
                render: (a) => <b>{a.studentNo}</b>,
              },
              { key: 'type', header: 'Tür', sortable: true, value: (a) => TYPE_TR[a.type] ?? a.type },
              {
                key: 'targetProgram',
                header: 'Hedef Program',
                sortable: true,
                value: (a) => a.targetProgram,
              },
              {
                key: 'gpa',
                header: 'GNO',
                sortable: true,
                num: true,
                value: (a) => (a.gpaSnapshot == null ? -1 : Number(a.gpaSnapshot)),
                render: (a) => (
                  <>
                    {fmtGpa(a.gpaSnapshot)}{' '}
                    {belowThreshold(a) && (
                      <Badge tone="warn">düşük</Badge>
                    )}
                  </>
                ),
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                sortable: true,
                value: (a) => a.createdAt,
                render: (a) => fmtDate(a.createdAt),
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (a) => STATUS_TR[a.status] ?? a.status,
                render: (a) => (
                  <Badge tone={TONE[a.status] ?? 'muted'}>{STATUS_TR[a.status] ?? a.status}</Badge>
                ),
              },
              {
                key: 'action',
                header: 'İşlem',
                render: (a) => (
                  <div className="row" style={{ gap: 6, marginBottom: 0, flexWrap: 'wrap' }}>
                    {OPEN.has(a.status) &&
                      NEXT.filter(
                        (n) => !(a.status === 'in_review' && n.value === 'in_review'),
                      ).map((n) => (
                        <Button
                          key={n.value}
                          variant={n.variant}
                          sm
                          disabled={busyId === a.id}
                          onClick={() => transition(a, n.value)}
                        >
                          {n.label}
                        </Button>
                      ))}
                    <Button variant="ghost" sm icon="eye" onClick={() => setDetail(a)}>
                      Detay
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${TYPE_TR[detail.type] ?? detail.type} · ${detail.studentNo}` : undefined}
      >
        {detail && (
          <>
            <p className="hint">
              Hedef: {detail.targetProgram} · {fmtDate(detail.createdAt)}
            </p>
            <StatusTimeline status={detail.status} />

            {OPEN.has(detail.status) && (
              <div className="row" style={{ gap: 6, marginTop: 12, marginBottom: 0, flexWrap: 'wrap' }}>
                {NEXT.filter(
                  (n) => !(detail.status === 'in_review' && n.value === 'in_review'),
                ).map((n) => (
                  <Button
                    key={n.value}
                    variant={n.variant}
                    sm
                    disabled={busyId === detail.id}
                    onClick={() => transition(detail, n.value)}
                  >
                    {n.label}
                  </Button>
                ))}
              </div>
            )}

            <StatGrid
              stats={[
                { label: 'Başvuru GNO', value: fmtGpa(detail.gpaSnapshot), icon: 'grade', tone: belowThreshold(detail) ? 'warn' : undefined },
                { label: 'Tür', value: TYPE_TR[detail.type] ?? detail.type, icon: 'layers' },
              ]}
            />
            <p className="muted" style={{ fontSize: 12 }}>
              Başvuru tarihi: {new Date(detail.createdAt).toLocaleString('tr-TR')}
            </p>

            {belowThreshold(detail) && (
              <Alert tone="err">
                Başvuru GNO&apos;su önerilen eşiğin ({GPA_THRESHOLD.toFixed(2)}) altında. Onaydan
                önce yönetmelik koşullarını teyit edin.
              </Alert>
            )}
            {detail.decisionReason && (
              <Alert tone="info">
                <b>Karar gerekçesi:</b> {detail.decisionReason}
              </Alert>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
