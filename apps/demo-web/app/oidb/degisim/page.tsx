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
  toast,
  fmtDate,
} from '@/app/ui';

interface Mobility {
  id: string;
  studentNo: string;
  studentEmail: string;
  program: string;
  direction: string;
  partnerUniversity: string | null;
  term: string | null;
  status: string;
  createdAt: string;
}

const PROGRAM_TR: Record<string, string> = {
  erasmus: 'Erasmus',
  farabi: 'Farabi',
  mevlana: 'Mevlana',
};
const DIRECTION_TR: Record<string, string> = { giden: 'Giden', gelen: 'Gelen' };
const STATUS_TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  kabul: 'Kabul',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
};
const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  basvuruldu: 'warn',
  kabul: 'ok',
  tamamlandi: 'ok',
  iptal: 'danger',
};

// Personel kararı: hangi durumdan hangi durumlara geçilebilir.
const NEXT: Record<string, { value: string; label: string; variant: 'ok' | 'danger' | 'ghost' }[]> = {
  basvuruldu: [
    { value: 'kabul', label: 'Kabul Et', variant: 'ok' },
    { value: 'iptal', label: 'İptal', variant: 'danger' },
  ],
  kabul: [
    { value: 'tamamlandi', label: 'Tamamlandı', variant: 'ok' },
    { value: 'iptal', label: 'İptal', variant: 'danger' },
  ],
};

export default function DegisimHareketliligi(): React.ReactElement {
  const [rows, setRows] = useState<Mobility[]>([]);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api<{ items: Mobility[] }>('/exchange');
    setRows(res.items);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  async function setStatus(m: Mobility, status: string): Promise<void> {
    setBusyId(m.id);
    setErr('');
    try {
      await api(`/exchange/${m.id}`, { method: 'PATCH', body: { status } });
      toast('Durum güncellendi', {
        tone: status === 'iptal' ? 'err' : 'ok',
        body: `${m.studentNo} · ${PROGRAM_TR[m.program] ?? m.program} → ${STATUS_TR[status] ?? status}`,
      });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Güncelleme başarısız';
      setErr(msg);
      toast('Güncelleme başarısız', { tone: 'err', body: msg });
    } finally {
      setBusyId('');
    }
  }

  const counts = useMemo(
    () => ({
      giden: rows.filter((m) => m.direction === 'giden').length,
      gelen: rows.filter((m) => m.direction === 'gelen').length,
      open: rows.filter((m) => m.status === 'basvuruldu').length,
    }),
    [rows],
  );

  return (
    <>
      <PageHeader
        title="Değişim Hareketliliği"
        sub="Erasmus / Farabi / Mevlana giden-gelen öğrenci hareketliliği ve karar yönetimi."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Giden öğrenci', value: counts.giden, icon: 'arrowRight' },
            { label: 'Gelen öğrenci', value: counts.gelen, icon: 'inbox' },
            {
              label: 'Bekleyen başvuru',
              value: counts.open,
              icon: 'clock',
              tone: counts.open > 0 ? 'warn' : undefined,
            },
          ]}
        />
      )}

      <Card title="Hareketlilik Başvuruları" icon="layers">
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Mobility>
            rows={rows}
            search
            csv
            csvName="oidb-degisim-hareketliligi"
            empty={
              <EmptyState
                icon="inbox"
                title="Değişim başvurusu yok"
                sub="Henüz kayıtlı bir hareketlilik başvurusu bulunmuyor."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci',
                sortable: true,
                value: (m) => m.studentNo,
                render: (m) => (
                  <>
                    <b>{m.studentNo}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {m.studentEmail}
                    </div>
                  </>
                ),
              },
              {
                key: 'program',
                header: 'Program',
                sortable: true,
                value: (m) => PROGRAM_TR[m.program] ?? m.program,
              },
              {
                key: 'direction',
                header: 'Yön',
                sortable: true,
                value: (m) => DIRECTION_TR[m.direction] ?? m.direction,
                render: (m) => (
                  <Badge tone={m.direction === 'giden' ? 'info' : 'muted'}>
                    {DIRECTION_TR[m.direction] ?? m.direction}
                  </Badge>
                ),
              },
              {
                key: 'partnerUniversity',
                header: 'Üniversite',
                sortable: true,
                value: (m) => m.partnerUniversity ?? '',
                render: (m) => m.partnerUniversity ?? '—',
              },
              {
                key: 'term',
                header: 'Dönem',
                sortable: true,
                value: (m) => m.term ?? '',
                render: (m) => m.term ?? '—',
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                sortable: true,
                value: (m) => m.createdAt,
                render: (m) => fmtDate(m.createdAt),
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (m) => STATUS_TR[m.status] ?? m.status,
                render: (m) => (
                  <Badge tone={TONE[m.status] ?? 'muted'}>{STATUS_TR[m.status] ?? m.status}</Badge>
                ),
              },
              {
                key: 'action',
                header: 'İşlem',
                render: (m) => {
                  const opts = NEXT[m.status];
                  if (!opts) return <span className="muted">—</span>;
                  return (
                    <div className="row" style={{ gap: 6, marginBottom: 0, flexWrap: 'wrap' }}>
                      {opts.map((o) => (
                        <Button
                          key={o.value}
                          variant={o.variant}
                          sm
                          disabled={busyId === m.id}
                          onClick={() => setStatus(m, o.value)}
                        >
                          {o.label}
                        </Button>
                      ))}
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
