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

interface DmApp {
  id: string;
  type: string;
  status: string;
  gpaSnapshot: number | string | null;
  decisionReason: string | null;
  createdAt: string;
  studentNo: string;
  targetProgram: string;
}

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

/** Yönetmelik eşikleri (ÇAP min. GNO 3.00, yandal min. 2.50) — sunucu da doğrular. */
const GPA_MIN: Record<string, number> = { cap: 3.0, yandal: 2.5 };

const trDateTime = (d: string): string => new Date(d).toLocaleString('tr-TR');
const gpaNum = (v: DmApp['gpaSnapshot']): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n == null || Number.isNaN(n) ? null : n;
};
const gpaText = (v: DmApp['gpaSnapshot']): string => {
  const n = gpaNum(v);
  return n == null ? '—' : n.toFixed(2);
};

function Timeline({ a }: { a: DmApp }): React.ReactElement {
  const decided = a.status === 'approved' || a.status === 'rejected' || a.status === 'cancelled';
  const steps: { label: string; done: boolean; danger?: boolean }[] = [
    { label: 'Başvuru alındı', done: true },
    { label: 'İncelemeye alındı', done: a.status === 'in_review' || decided },
    {
      label:
        a.status === 'approved'
          ? 'Onaylandı'
          : a.status === 'rejected'
            ? 'Reddedildi'
            : a.status === 'cancelled'
              ? 'İptal edildi'
              : 'Karar bekleniyor',
      done: decided,
      danger: a.status === 'rejected' || a.status === 'cancelled',
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

export default function CapOnay(): React.ReactElement {
  const [apps, setApps] = useState<DmApp[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<DmApp | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setApps(await api<DmApp[]>('/portal/double-major'));
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
      await api(`/double-major/${id}/transition`, {
        method: 'POST',
        body: { to, reason: r || undefined },
      });
      const okMsg =
        to === 'approved'
          ? 'Başvuru onaylandı.'
          : to === 'rejected'
            ? 'Başvuru reddedildi.'
            : to === 'submitted'
              ? 'Başvuru, ek bilgi için öğrenciye geri gönderildi.'
              : 'Başvuru incelemeye alındı.';
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

  const pending = useMemo(
    () => apps.filter((a) => a.status === 'submitted' || a.status === 'in_review'),
    [apps],
  );
  const closed = useMemo(
    () => apps.filter((a) => !(a.status === 'submitted' || a.status === 'in_review')),
    [apps],
  );
  const pendingView = useMemo(
    () => (typeFilter ? pending.filter((a) => a.type === typeFilter) : pending),
    [pending, typeFilter],
  );

  if (err && apps.length === 0 && !loading) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="ÇAP / Yandal Kuyruğu"
        sub="Çift anadal ve yandal başvuruları. Uygunluk (GNO + tamamlanan dönem oranı) sunucuda denetlenir; eşik altı GNO satırda vurgulanır. Dekanlık kararı için gerekçe zorunludur."
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
            { label: 'Bekleyen Başvuru', value: pending.length, icon: 'inbox' },
            { label: 'ÇAP (toplam)', value: apps.filter((a) => a.type === 'cap').length, icon: 'layers' },
            {
              label: 'Yandal (toplam)',
              value: apps.filter((a) => a.type === 'yandal').length,
              icon: 'layers',
            },
            {
              label: 'Onaylanan',
              value: apps.filter((a) => a.status === 'approved').length,
              icon: 'checkCircle',
              tone: 'ok',
            },
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
                  { value: 'cap', label: 'ÇAP' },
                  { value: 'yandal', label: 'Yandal' },
                ]}
              />
            </div>
            {pending.length === 0 ? (
              <EmptyState
                icon="checkCircle"
                title="Onay bekleyen başvuru yok"
                sub="Tüm ÇAP/yandal başvuruları sonuçlandırıldı."
              />
            ) : pendingView.length === 0 ? (
              <EmptyState
                icon="filter"
                title="Filtreyle eşleşen bekleyen başvuru yok"
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
                    <th>Hedef Program</th>
                    <th>GNO</th>
                    <th>Durum</th>
                    <th style={{ width: '34%' }}>Gerekçe &amp; Karar</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingView.map((a) => {
                    const g = gpaNum(a.gpaSnapshot);
                    const min = GPA_MIN[a.type];
                    const belowMin = g != null && min != null && g < min;
                    return (
                      <tr key={a.id}>
                        <td>
                          <button
                            className="btn ghost sm"
                            onClick={() => setDetail(a)}
                            title="Detay"
                          >
                            {a.studentNo}
                          </button>
                        </td>
                        <td>{a.type === 'cap' ? 'ÇAP' : 'Yandal'}</td>
                        <td>{a.targetProgram}</td>
                        <td>
                          {belowMin ? (
                            <Badge tone="danger">{gpaText(a.gpaSnapshot)}</Badge>
                          ) : (
                            gpaText(a.gpaSnapshot)
                          )}
                        </td>
                        <td>
                          <Badge tone={STATUS_TONE[a.status] ?? 'muted'}>
                            {STATUS_TR[a.status] ?? a.status}
                          </Badge>
                        </td>
                        <td>
                          <div className="field" style={{ marginBottom: 6 }}>
                            <input
                              placeholder="Karar gerekçesi (zorunlu)…"
                              value={reason[a.id] ?? ''}
                              onChange={(e) =>
                                setReason((s) => ({ ...s, [a.id]: e.target.value }))
                              }
                            />
                          </div>
                          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                            {a.status === 'submitted' && (
                              <Button
                                variant="ghost"
                                sm
                                disabled={busy === a.id}
                                onClick={() => act(a.id, 'in_review')}
                              >
                                İncelemeye Al
                              </Button>
                            )}
                            {a.status === 'in_review' && (
                              <Button
                                variant="ghost"
                                sm
                                disabled={busy === a.id}
                                onClick={() => act(a.id, 'submitted')}
                                title="Öğrenciden ek bilgi iste"
                              >
                                Bilgi İste
                              </Button>
                            )}
                            <Button
                              variant="ok"
                              sm
                              disabled={busy === a.id || a.status !== 'in_review'}
                              onClick={() => act(a.id, 'approved')}
                              title={a.status !== 'in_review' ? 'Önce incelemeye alın' : ''}
                            >
                              Onayla
                            </Button>
                            <Button
                              variant="danger"
                              sm
                              disabled={busy === a.id || a.status !== 'in_review'}
                              onClick={() => act(a.id, 'rejected')}
                              title={a.status !== 'in_review' ? 'Önce incelemeye alın' : ''}
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

      <Card title="Sonuçlanan Başvurular" icon="checkCircle">
        {loading ? (
          <Skeleton lines={4} />
        ) : (
          <DataTable<DmApp>
            rows={closed}
            search
            csv
            csvName="sonuclanan-cap-yandal"
            empty={<EmptyState icon="inbox" title="Henüz sonuçlanmış başvuru yok" />}
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                sortable: true,
                value: (a) => a.studentNo,
                render: (a) => <b>{a.studentNo}</b>,
              },
              {
                key: 'type',
                header: 'Tür',
                sortable: true,
                value: (a) => (a.type === 'cap' ? 'ÇAP' : 'Yandal'),
              },
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
                value: (a) => gpaNum(a.gpaSnapshot) ?? -1,
                render: (a) => gpaText(a.gpaSnapshot),
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (a) => STATUS_TR[a.status] ?? a.status,
                render: (a) => (
                  <Badge tone={STATUS_TONE[a.status] ?? 'muted'}>
                    {STATUS_TR[a.status] ?? a.status}
                  </Badge>
                ),
              },
              {
                key: 'reason',
                header: 'Gerekçe',
                value: (a) => a.decisionReason ?? '—',
                render: (a) => <span className="muted">{a.decisionReason ?? '—'}</span>,
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Başvuru · ${detail.studentNo}` : undefined}
      >
        {detail &&
          (() => {
            const g = gpaNum(detail.gpaSnapshot);
            const min = GPA_MIN[detail.type];
            const belowMin = g != null && min != null && g < min;
            return (
              <>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Badge tone={STATUS_TONE[detail.status] ?? 'muted'}>
                    {STATUS_TR[detail.status] ?? detail.status}
                  </Badge>
                  <Badge tone="muted">{detail.type === 'cap' ? 'Çift Anadal' : 'Yandal'}</Badge>
                  {belowMin && <Badge tone="danger">Eşik altı GNO</Badge>}
                </div>

                <h2 style={{ marginTop: 12 }}>Uygunluk Değerlendirmesi</h2>
                <ul className="list" style={{ margin: 0, paddingLeft: 0 }}>
                  <li className="list-item">
                    <span className="meta">Başvuru türü</span>{' '}
                    {detail.type === 'cap' ? 'Çift Anadal' : 'Yandal'}
                  </li>
                  <li className="list-item">
                    <span className="meta">Hedef program</span> {detail.targetProgram}
                  </li>
                  <li className="list-item">
                    <span className="meta">GNO (anlık)</span> {gpaText(detail.gpaSnapshot)}{' '}
                    {min != null && (
                      <Badge tone={belowMin ? 'danger' : 'ok'}>eşik {min.toFixed(2)}</Badge>
                    )}
                  </li>
                  <li className="list-item">
                    <span className="meta">Başvuru tarihi</span> {trDateTime(detail.createdAt)}
                  </li>
                </ul>
                {belowMin && (
                  <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                    GNO yönetmelik eşiğinin altında. İstisnai kabul için gerekçe netleştirilmelidir.
                  </p>
                )}

                <h2 style={{ marginTop: 16 }}>İş Akışı</h2>
                <Timeline a={detail} />
              </>
            );
          })()}
      </Drawer>
    </>
  );
}
