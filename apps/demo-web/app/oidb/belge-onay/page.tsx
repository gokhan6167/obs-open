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

export default function BelgeOnayPage(): React.ReactElement {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const all = await api<Req[]>('/portal/requests');
    setReqs(all.filter((r) => r.type === 'belge'));
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(
    () => reqs.filter((r) => scope === 'all' || OPEN.has(r.status)),
    [reqs, scope],
  );

  const counts = useMemo(
    () => ({
      open: reqs.filter((r) => OPEN.has(r.status)).length,
      approved: reqs.filter((r) => r.status === 'approved').length,
      rejected: reqs.filter((r) => r.status === 'rejected').length,
    }),
    [reqs],
  );

  const belgeAdi = (r: Req): string =>
    r.payload && typeof r.payload.belge === 'string'
      ? String(r.payload.belge)
      : r.payload && typeof r.payload.aciklama === 'string'
        ? String(r.payload.aciklama)
        : 'Belge talebi';

  async function transition(r: Req, to: 'approved' | 'rejected'): Promise<void> {
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
      toast('Belge talebi güncellendi', {
        tone: to === 'rejected' ? 'err' : 'ok',
        body: `${r.studentNo} · ${belgeAdi(r)} → ${STATUS_TR[to]}`,
      });
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Geçiş başarısız';
      setErr(m);
      toast('Geçiş başarısız', { tone: 'err', body: m });
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <PageHeader
        title="Belge Onay"
        sub="Öğrenci belge taleplerini onaylayın veya gerekçeyle reddedin."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Bekleyen talep',
              value: counts.open,
              icon: 'inbox',
              tone: counts.open > 0 ? 'warn' : undefined,
            },
            { label: 'Onaylanan', value: counts.approved, icon: 'checkCircle', tone: 'ok' },
            { label: 'Reddedilen', value: counts.rejected, icon: 'flag' },
          ]}
        />
      )}

      <Card title="Belge talepleri" icon="fileText">
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
          <DataTable<Req>
            rows={filtered}
            search
            csv
            csvName="oidb-belge-onay"
            empty={
              <EmptyState
                icon="checkCircle"
                title="Bekleyen belge talebi yok"
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
                key: 'belge',
                header: 'Belge',
                value: (r) => belgeAdi(r),
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
                render: (r) =>
                  OPEN.has(r.status) ? (
                    <div className="row" style={{ gap: 6, marginBottom: 0, flexWrap: 'wrap' }}>
                      <Button
                        variant="ok"
                        sm
                        icon="check"
                        disabled={busyId === r.id}
                        onClick={() => transition(r, 'approved')}
                      >
                        Onayla
                      </Button>
                      <Button
                        variant="danger"
                        sm
                        icon="flag"
                        disabled={busyId === r.id}
                        onClick={() => transition(r, 'rejected')}
                      >
                        Reddet
                      </Button>
                    </div>
                  ) : (
                    <span className="muted">
                      {r.decisionReason ? `Gerekçe: ${r.decisionReason}` : '—'}
                    </span>
                  ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
