'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  SkeletonStats,
  DataTable,
  Badge,
  Button,
  Alert,
  Skeleton,
  EmptyState,
  Segmented,
  Drawer,
  toast,
  fmtDate,
} from '@/app/ui';

interface Thesis {
  id: string;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  title: string;
  summary: string | null;
  advisorUserId: string | null;
  advisorEmail: string | null;
  status: string;
  decisionNote: string | null;
  createdAt: string;
}

const STATUS_TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  incelemede: 'İncelemede',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi',
  iptal: 'İptal',
};
const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  basvuruldu: 'warn',
  incelemede: 'info',
  onaylandi: 'ok',
  reddedildi: 'danger',
  iptal: 'danger',
};
const OPEN = new Set(['basvuruldu', 'incelemede']);

export default function TezOnayPage(): React.ReactElement {
  const [rows, setRows] = useState<Thesis[]>([]);
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [active, setActive] = useState<Thesis | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ items: Thesis[] }>('/thesis');
    setRows(res.items);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(
    () => rows.filter((r) => scope === 'all' || OPEN.has(r.status)),
    [rows, scope],
  );

  const counts = useMemo(
    () => ({
      open: rows.filter((r) => OPEN.has(r.status)).length,
      approved: rows.filter((r) => r.status === 'onaylandi').length,
      rejected: rows.filter((r) => r.status === 'reddedildi').length,
    }),
    [rows],
  );

  async function decide(r: Thesis, status: 'onaylandi' | 'reddedildi'): Promise<void> {
    let decisionNote: string | undefined;
    if (status === 'reddedildi') {
      const input = window.prompt('Red gerekçesi (öğrenciye görünür):', '');
      if (input === null) return;
      decisionNote = input || undefined;
    }
    setBusyId(r.id);
    setErr('');
    try {
      await api(`/thesis/${r.id}`, { method: 'PATCH', body: { status, decisionNote } });
      toast('Tez başvurusu güncellendi', {
        tone: status === 'reddedildi' ? 'err' : 'ok',
        body: `${r.studentNo} · ${r.title} → ${STATUS_TR[status]}`,
      });
      setActive(null);
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Karar başarısız';
      setErr(m);
      toast('Karar başarısız', { tone: 'err', body: m });
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <PageHeader
        title="Tez / Proje Onay"
        sub="Öğrenci tez ve proje konusu başvurularını inceleyip onaylayın veya gerekçeyle reddedin."
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
            { label: 'Onaylanan', value: counts.approved, icon: 'checkCircle', tone: 'ok' },
            { label: 'Reddedilen', value: counts.rejected, icon: 'flag' },
          ]}
        />
      )}

      <Card title="Tez / proje başvuruları" icon="fileText">
        {err && <Alert tone="err">{err}</Alert>}
        <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="field">
            <label>Kapsam</label>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'open', label: 'Sadece bekleyen' },
                { value: 'all', label: 'Tümü' },
              ]}
            />
          </div>
        </div>
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Thesis>
            rows={filtered}
            search
            csv
            csvName="oidb-tez-onay"
            empty={
              <EmptyState
                icon="checkCircle"
                title="Bekleyen tez başvurusu yok"
                sub="Kapsamı 'Tümü' yaparak sonuçlanmış başvuruları da görebilirsiniz."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => (
                  <div>
                    <b>{r.studentNo}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.studentEmail}
                    </div>
                  </div>
                ),
              },
              {
                key: 'title',
                header: 'Başlık',
                sortable: true,
                value: (r) => r.title,
              },
              {
                key: 'advisor',
                header: 'Danışman',
                value: (r) => r.advisorEmail ?? '—',
                render: (r) => r.advisorEmail ?? <span className="muted">—</span>,
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
                key: 'action',
                header: 'İşlem',
                render: (r) => (
                  <Button variant="subtle" sm icon="eye" onClick={() => setActive(r)}>
                    Detay
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={active !== null}
        onClose={() => setActive(null)}
        title={active ? active.title : 'Tez başvurusu'}
      >
        {active && (
          <>
            {err && <Alert tone="err">{err}</Alert>}
            <div className="field">
              <label>Öğrenci</label>
              <div>
                <b>{active.studentNo}</b> · {active.studentEmail}
              </div>
            </div>
            <div className="field">
              <label>Danışman</label>
              <div>{active.advisorEmail ?? <span className="muted">Atanmamış</span>}</div>
            </div>
            <div className="field">
              <label>Durum</label>
              <div>
                <Badge tone={TONE[active.status] ?? 'muted'}>
                  {STATUS_TR[active.status] ?? active.status}
                </Badge>
              </div>
            </div>
            <div className="field">
              <label>Başvuru tarihi</label>
              <div>{fmtDate(active.createdAt)}</div>
            </div>
            <div className="field">
              <label>Özet</label>
              <div style={{ whiteSpace: 'pre-wrap' }}>
                {active.summary || <span className="muted">Özet girilmemiş.</span>}
              </div>
            </div>
            {active.decisionNote && (
              <div className="field">
                <label>Karar notu</label>
                <div style={{ whiteSpace: 'pre-wrap' }}>{active.decisionNote}</div>
              </div>
            )}
            {OPEN.has(active.status) && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 0 }}>
                <Button
                  variant="ok"
                  icon="check"
                  disabled={busyId === active.id}
                  onClick={() => decide(active, 'onaylandi')}
                >
                  Onayla
                </Button>
                <Button
                  variant="danger"
                  icon="flag"
                  disabled={busyId === active.id}
                  onClick={() => decide(active, 'reddedildi')}
                >
                  Reddet
                </Button>
              </div>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
