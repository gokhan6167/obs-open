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

interface Req {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  decisionReason: string | null;
  createdAt: string;
  studentNo: string;
}

const TYPE_TR: Record<string, string> = {
  kayit_dondurma: 'Kayıt Dondurma',
  mazeret_sinavi: 'Mazeret Sınavı',
  belge: 'Belge Talebi',
  diger: 'Diğer',
};
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
// Açık bir talep için mümkün sonraki adımlar.
const NEXT: { value: string; label: string; variant: 'ghost' | 'ok' | 'danger' }[] = [
  { value: 'in_review', label: 'İncele', variant: 'ghost' },
  { value: 'approved', label: 'Onayla', variant: 'ok' },
  { value: 'rejected', label: 'Reddet', variant: 'danger' },
];

// Talep akışında bir statünün hangi aşamada olduğunu gösteren sıra.
const FLOW = ['submitted', 'in_review', 'approved'] as const;

/** Durum makinesi ilerlemesini yatay bir zaman çizelgesi olarak gösterir. */
function StatusTimeline({ status }: { status: string }): React.ReactElement {
  const rejected = status === 'rejected';
  const cancelled = status === 'cancelled';
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
      {rejected && (
        <>
          <span className="muted">·</span>
          <Badge tone="danger">{STATUS_TR.rejected}</Badge>
        </>
      )}
      {cancelled && (
        <>
          <span className="muted">·</span>
          <Badge tone="muted">{STATUS_TR.cancelled}</Badge>
        </>
      )}
    </div>
  );
}

export default function TalepKuyrugu(): React.ReactElement {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [detail, setDetail] = useState<Req | null>(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setReqs(await api<Req[]>('/portal/requests'));
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(() => {
    return reqs.filter(
      (r) => (!typeFilter || r.type === typeFilter) && (scope === 'all' || OPEN.has(r.status)),
    );
  }, [reqs, typeFilter, scope]);

  async function transition(r: Req, to: string): Promise<void> {
    let reason: string | undefined;
    if (to === 'rejected') {
      const input = window.prompt('Red gerekçesi (öğrenciye görünür):', '');
      if (input === null) return;
      reason = input || undefined;
    }
    setBusyId(r.id);
    setErr('');
    try {
      await api(`/requests/${r.id}/transition`, { method: 'POST', body: { to, reason } });
      toast('Talep güncellendi', {
        tone: to === 'rejected' ? 'err' : 'ok',
        body: `${r.studentNo} · ${TYPE_TR[r.type] ?? r.type} → ${STATUS_TR[to] ?? to}`,
      });
      await load();
      setDetail((d) => (d && d.id === r.id ? { ...d, status: to, decisionReason: reason ?? d.decisionReason } : d));
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Geçiş başarısız';
      setErr(m);
      toast('Geçiş başarısız', { tone: 'err', body: m });
    } finally {
      setBusyId('');
    }
  }

  const counts = useMemo(() => {
    const open = reqs.filter((r) => OPEN.has(r.status));
    return {
      open: open.length,
      today: reqs.filter((r) => new Date(r.createdAt).toDateString() === new Date().toDateString())
        .length,
      approved: reqs.filter((r) => r.status === 'approved').length,
    };
  }, [reqs]);

  const payloadDesc = (r: Req): string =>
    r.decisionReason ??
    (r.payload && typeof r.payload.aciklama === 'string' ? String(r.payload.aciklama) : '—');

  return (
    <>
      <PageHeader
        title="Talep Kuyruğu"
        sub="Tüm talep tipleri tek kuyrukta. İncele, gerekçeyle onayla veya reddet."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Açık talep',
              value: counts.open,
              icon: 'inbox',
              tone: counts.open > 0 ? 'warn' : undefined,
            },
            { label: 'Bugün gelen', value: counts.today, icon: 'activity' },
            { label: 'Onaylanmış', value: counts.approved, icon: 'checkCircle', tone: 'ok' },
          ]}
        />
      )}

      <Card title="Kuyruk" icon="inbox">
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
                ...Object.entries(TYPE_TR).map(([v, l]) => ({ value: v, label: l })),
              ]}
            />
          </div>
        </div>
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Req>
            rows={filtered}
            search
            csv
            csvName="oidb-talepler"
            empty={
              <EmptyState
                icon="checkCircle"
                title="Bu filtreyle bekleyen talep yok"
                sub="Kapsamı 'Tümü' yaparak sonuçlanmış talepleri de görebilirsiniz."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => <b>{r.studentNo}</b>,
              },
              {
                key: 'type',
                header: 'Tür',
                sortable: true,
                value: (r) => TYPE_TR[r.type] ?? r.type,
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                sortable: true,
                value: (r) => r.createdAt,
                render: (r) => fmtDate(r.createdAt),
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={TONE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>
                ),
              },
              {
                key: 'desc',
                header: 'Açıklama / Karar',
                value: (r) => payloadDesc(r),
                render: (r) => <span className="muted">{payloadDesc(r)}</span>,
              },
              {
                key: 'action',
                header: 'İşlem',
                render: (r) =>
                  OPEN.has(r.status) ? (
                    <div className="row" style={{ gap: 6, marginBottom: 0, flexWrap: 'wrap' }}>
                      {NEXT.filter(
                        (n) => !(r.status === 'in_review' && n.value === 'in_review'),
                      ).map((n) => (
                        <Button
                          key={n.value}
                          variant={n.variant}
                          sm
                          disabled={busyId === r.id}
                          onClick={() => transition(r, n.value)}
                        >
                          {n.label}
                        </Button>
                      ))}
                      <Button variant="ghost" sm icon="eye" onClick={() => setDetail(r)}>
                        Detay
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" sm icon="eye" onClick={() => setDetail(r)}>
                      Detay
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Talep · ${detail.studentNo}` : undefined}
      >
        {detail && (
          <>
            <p className="hint">
              {TYPE_TR[detail.type] ?? detail.type} · {fmtDate(detail.createdAt)}
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

            <h2 style={{ marginTop: 16 }}>Başvuru içeriği</h2>
            {detail.payload && Object.keys(detail.payload).length > 0 ? (
              <table>
                <tbody>
                  {Object.entries(detail.payload).map(([k, v]) => (
                    <tr key={k}>
                      <td className="muted" style={{ width: 180 }}>
                        {k}
                      </td>
                      <td>{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState icon="fileText" title="Ek içerik yok" />
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
