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
  EmptyState,
  Skeleton,
  SkeletonStats,
  Alert,
  Segmented,
  Drawer,
  BarChart,
  fmtDate,
} from '@/app/ui';

interface Req {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  studentNo: string;
  payload?: Record<string, unknown> | null;
  decisionReason?: string | null;
}
interface DmApp {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  studentNo: string;
  targetProgram: string;
  gpaSnapshot?: number | string | null;
}

const REQ_TYPE_TR: Record<string, string> = {
  kayit_dondurma: 'Kayıt Dondurma',
  mazeret_sinavi: 'Mazeret Sınavı',
  belge: 'Belge Talebi',
  diger: 'Diğer',
};
const STATUS_TR: Record<string, string> = {
  submitted: 'Beklemede',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};

/** Bekleme süresi (SLA): 3 gün üzeri gecikmiş. */
function slaInfo(createdAt: string): { tone: 'danger' | 'warn' | 'muted'; text: string; days: number } {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days >= 3) return { tone: 'danger', text: `${days} gün · gecikmiş`, days };
  if (days >= 1) return { tone: 'warn', text: `${days} gün`, days };
  return { tone: 'muted', text: 'bugün', days };
}
const fmtDateTime = (s: string): string => {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
};

const OPEN = (s: string): boolean => s === 'submitted' || s === 'in_review';

type Row = {
  key: string;
  kind: 'talep' | 'cap';
  studentNo: string;
  konu: string;
  status: string;
  createdAt: string;
  payload?: Record<string, unknown> | null;
  targetProgram?: string;
  gpa?: string;
};

type KindKey = 'all' | 'talep' | 'cap' | 'overdue';
const KIND_FILTERS: { value: KindKey; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'talep', label: 'Talep' },
  { value: 'cap', label: 'ÇAP/Yandal' },
  { value: 'overdue', label: 'Gecikmiş' },
];

const gpaText = (v: number | string | null | undefined): string => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n == null || Number.isNaN(n) ? '—' : n.toFixed(2);
};

export default function BekleyenIsler(): React.ReactElement {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<KindKey>('all');
  const [sel, setSel] = useState<Row | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [reqs, dms] = await Promise.all([
      api<Req[]>('/portal/requests'),
      api<DmApp[]>('/portal/double-major'),
    ]);
    const r: Row[] = [
      ...reqs
        .filter((x) => OPEN(x.status))
        .map((x) => ({
          key: `t-${x.id}`,
          kind: 'talep' as const,
          studentNo: x.studentNo,
          konu: REQ_TYPE_TR[x.type] ?? x.type,
          status: x.status,
          createdAt: x.createdAt,
          payload: x.payload ?? null,
        })),
      ...dms
        .filter((x) => OPEN(x.status))
        .map((x) => ({
          key: `d-${x.id}`,
          kind: 'cap' as const,
          studentNo: x.studentNo,
          konu: `${x.type === 'cap' ? 'ÇAP' : 'Yandal'} → ${x.targetProgram}`,
          status: x.status,
          createdAt: x.createdAt,
          targetProgram: x.targetProgram,
          gpa: gpaText(x.gpaSnapshot),
        })),
    ];
    r.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    setRows(r);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, [load]);

  async function refresh(): Promise<void> {
    setRefreshing(true);
    setErr('');
    try {
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setRefreshing(false);
    }
  }

  const shown = useMemo(() => {
    return rows.filter((x) => {
      if (kind === 'talep') return x.kind === 'talep';
      if (kind === 'cap') return x.kind === 'cap';
      if (kind === 'overdue') return slaInfo(x.createdAt).days >= 3;
      return true;
    });
  }, [rows, kind]);

  const overdue = rows.filter((x) => slaInfo(x.createdAt).days >= 3).length;
  const talepCount = rows.filter((x) => x.kind === 'talep').length;
  const capCount = rows.filter((x) => x.kind === 'cap').length;
  const oldest = rows[0] ? slaInfo(rows[0].createdAt).days : 0;

  const ageDist = useMemo(() => {
    const buckets = { 'Bugün': 0, '1-2 gün': 0, '3+ gün': 0 } as Record<string, number>;
    for (const x of rows) {
      const d = slaInfo(x.createdAt).days;
      if (d >= 3) buckets['3+ gün']++;
      else if (d >= 1) buckets['1-2 gün']++;
      else buckets['Bugün']++;
    }
    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }, [rows]);

  const selPayload = sel?.payload
    ? Object.entries(sel.payload).filter(([, v]) => v != null && v !== '')
    : [];

  return (
    <>
      <PageHeader
        title="Bekleyen İşler"
        sub="Talep ve ÇAP/Yandal kuyruklarından türetilmiş canlı izleme panosu. Bekleme süresi 3 günü aşan işler kırmızı ile işaretlenir; kayıt/karar buradan yapılmaz, karar mercileri işler. Bir satıra tıklayarak ayrıntı panelini açın. Ayrıntılı durum için Onay Takip sayfasına bakın."
        actions={
          <Button variant="ghost" icon="refresh" sm onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Yenileniyor…' : 'Yenile'}
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={5} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam Bekleyen', value: rows.length, icon: 'inbox' },
            {
              label: 'Gecikmiş (3+ gün)',
              value: overdue,
              icon: 'alert',
              tone: overdue > 0 ? 'danger' : 'ok',
            },
            { label: 'Bekleyen Talep', value: talepCount, icon: 'fileText' },
            { label: 'Bekleyen ÇAP/Yandal', value: capCount, icon: 'layers' },
            {
              label: 'En Eski (gün)',
              value: oldest,
              icon: 'clock',
              tone: oldest >= 3 ? 'danger' : oldest >= 1 ? 'warn' : 'ok',
            },
          ]}
        />
      )}

      {!loading && rows.length > 0 && (
        <Card title="Bekleme Yaşı Dağılımı" icon="chart">
          <BarChart data={ageDist} />
        </Card>
      )}

      <Card
        title="Bekleyen İş Kuyruğu"
        icon="clock"
        hint="En eski bekleyen en üstte. SLA hedefi: 3 iş günü. Detay için bir satıra tıklayın."
      >
        <Segmented value={kind} onChange={setKind} options={KIND_FILTERS} />
        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable
            rows={shown}
            search
            csv
            csvName="bekleyen-isler"
            pageSize={25}
            empty={
              <EmptyState
                icon="checkCircle"
                title={rows.length === 0 ? 'Bekleyen iş yok' : 'Bu filtreye uygun iş yok'}
                sub={
                  rows.length === 0
                    ? 'Tüm kuyruklar temiz.'
                    : 'Filtreyi değiştirerek diğer işlere bakabilirsiniz.'
                }
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                value: (x) => x.studentNo,
                sortable: true,
                render: (x) => <b>{x.studentNo}</b>,
              },
              {
                key: 'kind',
                header: 'Kaynak',
                value: (x) => (x.kind === 'cap' ? 'ÇAP/Yandal' : 'Talep'),
                sortable: true,
                render: (x) => (
                  <Badge tone={x.kind === 'cap' ? 'warn' : 'muted'}>
                    {x.kind === 'cap' ? 'ÇAP/Yandal' : 'Talep'}
                  </Badge>
                ),
              },
              { key: 'konu', header: 'Konu', value: (x) => x.konu, sortable: true },
              {
                key: 'status',
                header: 'Durum',
                value: (x) => STATUS_TR[x.status] ?? x.status,
                render: (x) => (
                  <Badge tone={x.status === 'in_review' ? 'warn' : 'muted'}>
                    {STATUS_TR[x.status] ?? x.status}
                  </Badge>
                ),
              },
              {
                key: 'sla',
                header: 'Bekleme (SLA)',
                num: true,
                value: (x) => slaInfo(x.createdAt).days,
                sortable: true,
                render: (x) => {
                  const s = slaInfo(x.createdAt);
                  return <Badge tone={s.tone}>{s.text}</Badge>;
                },
              },
              {
                key: 'act',
                header: '',
                render: (x) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => setSel(x)}>
                    Detay
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel ? `${sel.studentNo} · İş Detayı` : ''}
      >
        {sel && (
          <>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Badge tone={sel.kind === 'cap' ? 'warn' : 'muted'}>
                {sel.kind === 'cap' ? 'ÇAP/Yandal' : 'Talep'}
              </Badge>
              <Badge tone={sel.status === 'in_review' ? 'warn' : 'muted'}>
                {STATUS_TR[sel.status] ?? sel.status}
              </Badge>
              <Badge tone={slaInfo(sel.createdAt).tone}>{slaInfo(sel.createdAt).text}</Badge>
            </div>

            <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div className="l muted" style={{ fontSize: 12 }}>Konu</div>
                <div>{sel.konu}</div>
              </div>
              <div>
                <div className="l muted" style={{ fontSize: 12 }}>Başvuru Tarihi</div>
                <div>{fmtDateTime(sel.createdAt)}</div>
              </div>
              {sel.gpa && (
                <div>
                  <div className="l muted" style={{ fontSize: 12 }}>GNO (anlık)</div>
                  <div>{sel.gpa}</div>
                </div>
              )}
              {sel.targetProgram && (
                <div>
                  <div className="l muted" style={{ fontSize: 12 }}>Hedef Program</div>
                  <div>{sel.targetProgram}</div>
                </div>
              )}
            </div>

            {selPayload.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="l muted" style={{ fontSize: 12 }}>Dilekçe Ayrıntısı</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {selPayload.map(([k, v]) => (
                    <li key={k}>
                      <b>{k}:</b> {String(v)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Alert tone="info">
              Bu iş salt-izleme kuyruğundadır. Karar (onay/ret) yetkisi{' '}
              {sel.kind === 'cap'
                ? 'Fakülte Yönetim Kurulu / Dekanlık'
                : 'Öğrenci İşleri Daire Başkanlığı'}
              ndadır. Başvuru: {fmtDate(sel.createdAt)}.
            </Alert>
          </>
        )}
      </Drawer>
    </>
  );
}
