'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  EmptyState,
  Drawer,
  Segmented,
  toast,
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
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  submitted: 'warn',
  in_review: 'warn',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'muted',
};
const STATUS_TR: Record<string, string> = {
  submitted: 'Beklemede',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};

const trDateTime = (d: string): string => new Date(d).toLocaleString('tr-TR');

/** Bekleme süresi rozeti (SLA): 3 gün üzeri gecikmiş sayılır. */
function slaBadge(
  createdAt: string,
  status: string,
): { tone: 'warn' | 'danger' | 'muted'; text: string } | null {
  if (status === 'approved' || status === 'rejected' || status === 'cancelled') return null;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days >= 3) return { tone: 'danger', text: `${days} gün · gecikmiş` };
  if (days >= 1) return { tone: 'warn', text: `${days} gün` };
  return { tone: 'muted', text: 'bugün' };
}

/** İş akışı zaman çizelgesi: başvuru → (inceleme) → sonuç. */
function Timeline({ r }: { r: Req }): React.ReactElement {
  const decided = r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled';
  const steps: { label: string; done: boolean; danger?: boolean }[] = [
    { label: 'Başvuru alındı', done: true },
    { label: 'İncelemeye alındı', done: r.status === 'in_review' || decided },
    {
      label:
        r.status === 'approved'
          ? 'Onaylandı'
          : r.status === 'rejected'
            ? 'Reddedildi'
            : r.status === 'cancelled'
              ? 'İptal edildi'
              : 'Karar bekleniyor',
      done: decided,
      danger: r.status === 'rejected' || r.status === 'cancelled',
    },
  ];
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {steps.map((s, i) => (
        <li key={i} className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: s.done
                ? s.danger
                  ? 'var(--danger)'
                  : 'var(--accent)'
                : 'var(--line)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, color: s.done ? undefined : 'var(--muted)' }}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

export default function TalepOnay(): React.ReactElement {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Req | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setReqs(await api<Req[]>('/portal/requests'));
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, [load]);

  async function act(
    id: string,
    to: 'in_review' | 'approved' | 'rejected' | 'submitted',
  ): Promise<void> {
    const r = (reason[id] ?? '').trim();
    if ((to === 'approved' || to === 'rejected') && !r) {
      setErr('Onay/ret için gerekçe zorunludur.');
      toast('Gerekçe gerekli', { tone: 'err', body: 'Onay/ret için gerekçe zorunludur.' });
      return;
    }
    setBusy(id);
    setErr('');
    try {
      await api(`/requests/${id}/transition`, {
        method: 'POST',
        body: { to, reason: r || undefined },
      });
      const okMsg =
        to === 'approved'
          ? 'Talep onaylandı.'
          : to === 'rejected'
            ? 'Talep reddedildi.'
            : to === 'submitted'
              ? 'Talep, ek bilgi için öğrenciye geri gönderildi.'
              : 'Talep incelemeye alındı.';
      toast('İşlem tamam', { tone: to === 'rejected' ? 'info' : 'ok', body: okMsg });
      setReason((s) => ({ ...s, [id]: '' }));
      setDetail((d) => (d && d.id === id ? null : d));
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İşlem başarısız';
      setErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(null);
    }
  }

  const types = useMemo(() => Array.from(new Set(reqs.map((r) => r.type))).sort(), [reqs]);

  const pending = useMemo(
    () => reqs.filter((r) => r.status === 'submitted' || r.status === 'in_review'),
    [reqs],
  );
  const closed = useMemo(
    () => reqs.filter((r) => !(r.status === 'submitted' || r.status === 'in_review')),
    [reqs],
  );
  const pendingView = useMemo(
    () => (typeFilter ? pending.filter((r) => r.type === typeFilter) : pending),
    [pending, typeFilter],
  );

  const overdue = pending.filter((r) => slaBadge(r.createdAt, r.status)?.tone === 'danger').length;

  if (err && reqs.length === 0 && !loading) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Talep Onay Kuyruğu"
        sub="Fakülte yetkisindeki öğrenci dilekçeleri. Onay/ret için gerekçe zorunludur; tüm kararlar kayıt altına alınır. Eksik başvuruları ek bilgi için öğrenciye geri gönderebilirsiniz."
        actions={
          <Button variant="ghost" icon="refresh" onClick={() => load()}>
            Yenile
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Bekleyen Talep', value: pending.length, icon: 'inbox' },
            {
              label: 'Gecikmiş (3+ gün)',
              value: overdue,
              icon: 'clock',
              tone: overdue > 0 ? 'danger' : 'ok',
            },
            {
              label: 'İncelemede',
              value: pending.filter((r) => r.status === 'in_review').length,
              icon: 'eye',
            },
            { label: 'Sonuçlanan', value: closed.length, icon: 'checkCircle' },
          ]}
        />
      )}

      <Card title="Bekleyen Kuyruk" icon="inbox">
        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <>
            <div className="field" style={{ marginBottom: 12 }}>
              <Segmented
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { value: '', label: 'Tüm türler' },
                  ...types.map((t) => ({ value: t, label: TYPE_TR[t] ?? t })),
                ]}
              />
            </div>
            {pending.length === 0 ? (
              <EmptyState
                icon="checkCircle"
                title="Onay bekleyen talep yok"
                sub="Tüm dilekçeler sonuçlandırıldı."
              />
            ) : pendingView.length === 0 ? (
              <EmptyState
                icon="filter"
                title="Filtreyle eşleşen bekleyen talep yok"
                sub="Tür filtresini gevşetin."
                action={
                  <Button variant="ghost" sm onClick={() => setTypeFilter('')}>
                    Filtreyi temizle
                  </Button>
                }
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Öğrenci No</th>
                    <th>Tür</th>
                    <th>Bekleme</th>
                    <th>Durum</th>
                    <th style={{ width: '38%' }}>Gerekçe &amp; Karar</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingView.map((r) => {
                    const sla = slaBadge(r.createdAt, r.status);
                    return (
                      <tr key={r.id}>
                        <td>
                          <button
                            className="btn ghost sm"
                            onClick={() => setDetail(r)}
                            title="Detay"
                          >
                            {r.studentNo}
                          </button>
                        </td>
                        <td>{TYPE_TR[r.type] ?? r.type}</td>
                        <td>{sla && <Badge tone={sla.tone}>{sla.text}</Badge>}</td>
                        <td>
                          <Badge tone={STATUS_TONE[r.status] ?? 'muted'}>
                            {STATUS_TR[r.status] ?? r.status}
                          </Badge>
                        </td>
                        <td>
                          <div className="field" style={{ marginBottom: 6 }}>
                            <input
                              placeholder="Karar gerekçesi…"
                              value={reason[r.id] ?? ''}
                              onChange={(e) =>
                                setReason((s) => ({ ...s, [r.id]: e.target.value }))
                              }
                            />
                          </div>
                          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                            {r.status === 'submitted' && (
                              <Button
                                variant="ghost"
                                sm
                                disabled={busy === r.id}
                                onClick={() => act(r.id, 'in_review')}
                              >
                                İncelemeye Al
                              </Button>
                            )}
                            {r.status === 'in_review' && (
                              <Button
                                variant="ghost"
                                sm
                                disabled={busy === r.id}
                                onClick={() => act(r.id, 'submitted')}
                                title="Öğrenciden ek bilgi iste"
                              >
                                Bilgi İste
                              </Button>
                            )}
                            <Button
                              variant="ok"
                              sm
                              disabled={busy === r.id || r.status !== 'in_review'}
                              onClick={() => act(r.id, 'approved')}
                              title={r.status !== 'in_review' ? 'Önce incelemeye alın' : ''}
                            >
                              Onayla
                            </Button>
                            <Button
                              variant="danger"
                              sm
                              disabled={busy === r.id || r.status !== 'in_review'}
                              onClick={() => act(r.id, 'rejected')}
                              title={r.status !== 'in_review' ? 'Önce incelemeye alın' : ''}
                            >
                              Reddet
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </Card>

      <Card title="Sonuçlanan Talepler" icon="checkCircle">
        {loading ? (
          <Skeleton lines={4} />
        ) : (
          <DataTable<Req>
            rows={closed}
            search
            csv
            csvName="sonuclanan-talepler"
            empty={<EmptyState icon="inbox" title="Henüz sonuçlanmış talep yok" />}
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
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={STATUS_TONE[r.status] ?? 'muted'}>
                    {STATUS_TR[r.status] ?? r.status}
                  </Badge>
                ),
              },
              {
                key: 'reason',
                header: 'Gerekçe',
                value: (r) => r.decisionReason ?? '—',
                render: (r) => <span className="muted">{r.decisionReason ?? '—'}</span>,
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
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <Badge tone={STATUS_TONE[detail.status] ?? 'muted'}>
                {STATUS_TR[detail.status] ?? detail.status}
              </Badge>
              <Badge tone="muted">{TYPE_TR[detail.type] ?? detail.type}</Badge>
            </div>
            <p className="hint">Alındı: {trDateTime(detail.createdAt)}</p>

            <h2 style={{ marginTop: 12 }}>Başvuru Bilgileri</h2>
            {Object.entries(detail.payload ?? {}).length === 0 ? (
              <EmptyState icon="fileText" title="Ek başvuru alanı yok" />
            ) : (
              <ul className="list" style={{ margin: 0, paddingLeft: 0 }}>
                {Object.entries(detail.payload ?? {}).map(([k, v]) => (
                  <li key={k} className="list-item">
                    <span className="meta">{k}</span>{' '}
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </li>
                ))}
              </ul>
            )}

            <h2 style={{ marginTop: 16 }}>İş Akışı</h2>
            <Timeline r={detail} />
          </>
        )}
      </Drawer>
    </>
  );
}
