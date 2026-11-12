'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Shell } from '../components';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  EmptyState,
  Alert,
  Skeleton,
  toast,
  money,
} from '@/app/ui';

interface Dashboard {
  studentCount: number;
  activeStudents: number;
  graduatedStudents: number;
  totalEnrollments: number;
  collectedAmount: number;
}
interface DmApp {
  id: string;
  type: string;
  status: string;
  targetProgram: string;
  studentNo: string;
  gpaSnapshot: number | null;
  createdAt: string;
  decisionReason: string | null;
}

const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  submitted: 'warn',
  in_review: 'warn',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'muted',
};
const TR: Record<string, string> = {
  submitted: 'Başvuruldu',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};
const tr = (s: string): string => TR[s] ?? s;

export default function YonetimPage(): React.ReactElement {
  return (
    <Shell allow={['oidb', 'sistem_yoneticisi', 'dekanlik']}>
      <Dashboard />
    </Shell>
  );
}

function Dashboard(): React.ReactElement {
  const [stats, setStats] = useState<Dashboard | null>(null);
  const [apps, setApps] = useState<DmApp[]>([]);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [d, a] = await Promise.all([
      api<Dashboard>('/reports/dashboard'),
      api<DmApp[]>('/portal/double-major'),
    ]);
    setStats(d);
    setApps(a);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'));
  }, [load]);

  async function transition(id: string, to: string, reason?: string): Promise<void> {
    setBusyId(id);
    setErr('');
    try {
      await api(`/double-major/${id}/transition`, { method: 'POST', body: { to, reason } });
      toast('Başvuru güncellendi', {
        tone: to === 'rejected' ? 'err' : 'ok',
        body:
          to === 'approved'
            ? 'Başvuru onaylandı.'
            : to === 'rejected'
              ? 'Başvuru reddedildi.'
              : 'Başvuru incelemeye alındı.',
      });
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İşlem başarısız';
      setErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusyId('');
    }
  }

  const pending = useMemo(
    () => apps.filter((a) => ['submitted', 'in_review'].includes(a.status)),
    [apps],
  );
  const approved = useMemo(() => apps.filter((a) => a.status === 'approved').length, [apps]);

  return (
    <>
      <PageHeader
        title="Yönetim Paneli"
        sub="Öğrenci İşleri Daire Başkanlığı — Demo"
        actions={
          <Button variant="ghost" sm icon="refresh" onClick={() => load()}>
            Yenile
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {!loaded ? (
        <Skeleton lines={4} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Toplam Öğrenci',
              value: stats ? stats.studentCount.toLocaleString('tr-TR') : '—',
              icon: 'users',
            },
            {
              label: 'Aktif Öğrenci',
              value: stats ? stats.activeStudents.toLocaleString('tr-TR') : '—',
              icon: 'user',
              tone: 'ok',
            },
            {
              label: 'Ders Kaydı',
              value: stats ? stats.totalEnrollments.toLocaleString('tr-TR') : '—',
              icon: 'book',
            },
            {
              label: 'Tahsilat',
              value: stats ? money(stats.collectedAmount) : '—',
              icon: 'wallet',
            },
          ]}
        />
      )}

      <Card
        title="ÇAP / Yandal Başvuru Kuyruğu"
        icon="inbox"
        hint={`Bekleyen: ${pending.length}. Onay/red kararı durum makinesi + audit ile işlenir.`}
        actions={
          <>
            <Badge tone={pending.length ? 'warn' : 'muted'}>{pending.length} bekleyen</Badge>
            <Badge tone="ok">{approved} onaylı</Badge>
          </>
        }
      >
        {!loaded ? (
          <Skeleton lines={5} />
        ) : apps.length === 0 ? (
          <EmptyState icon="inbox" title="Başvuru yok" sub="ÇAP/Yandal başvuru kuyruğu şu an boş." />
        ) : (
          <DataTable
            rows={apps}
            csv
            csvName="cap-yandal-basvurulari"
            columns={[
              { key: 'studentNo', header: 'Öğrenci', value: (a) => a.studentNo },
              {
                key: 'type',
                header: 'Tür',
                value: (a) => (a.type === 'cap' ? 'ÇAP' : 'Yandal'),
                render: (a) => (a.type === 'cap' ? 'ÇAP' : 'Yandal'),
              },
              { key: 'targetProgram', header: 'Hedef Program', value: (a) => a.targetProgram },
              {
                key: 'gpaSnapshot',
                header: 'GNO',
                num: true,
                value: (a) => a.gpaSnapshot ?? 0,
                render: (a) => a.gpaSnapshot?.toFixed(2) ?? '—',
              },
              {
                key: 'status',
                header: 'Durum',
                value: (a) => tr(a.status),
                render: (a) => <Badge tone={BADGE[a.status] ?? 'muted'}>{tr(a.status)}</Badge>,
              },
              {
                key: 'action',
                header: 'İşlem',
                sortable: false,
                render: (a) => (
                  <div className="row" style={{ gap: 6 }}>
                    {a.status === 'submitted' && (
                      <Button
                        variant="ghost"
                        sm
                        disabled={busyId === a.id}
                        onClick={() => transition(a.id, 'in_review')}
                      >
                        İncelemeye al
                      </Button>
                    )}
                    {a.status === 'in_review' && (
                      <>
                        <Button
                          variant="ok"
                          sm
                          icon="check"
                          disabled={busyId === a.id}
                          onClick={() => transition(a.id, 'approved', 'Koşullar sağlandı')}
                        >
                          Onayla
                        </Button>
                        <Button
                          variant="danger"
                          sm
                          disabled={busyId === a.id}
                          onClick={() => transition(a.id, 'rejected', 'Koşullar sağlanmadı')}
                        >
                          Reddet
                        </Button>
                      </>
                    )}
                    {['approved', 'rejected', 'cancelled'].includes(a.status) && (
                      <span className="muted">{a.decisionReason ?? '—'}</span>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
