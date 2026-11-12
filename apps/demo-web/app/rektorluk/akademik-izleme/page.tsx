'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Alert,
  SkeletonStats,
  Skeleton,
  EmptyState,
  Segmented,
  ProgressBar,
  Meter,
  BarChart,
  Drawer,
  Button,
  Icon,
} from '@/app/ui';

interface ActiveTerm {
  id: string;
  year: number;
  term: string;
  name: string;
  startsOn: string;
  endsOn: string;
}
interface TermStats {
  sectionCount: number;
  totalQuota: number;
  totalFilled: number;
  fillRate: number;
  enrollmentsByStatus: Record<string, number>;
}
interface SectionRow {
  sectionId: string;
  courseCode: string;
  courseName: string;
  sectionCode: string;
  instructorName: string | null;
  quota: number;
  enrolled: number;
  fillRate: number;
  isOpen: boolean;
}

const num = (n: number): string => n.toLocaleString('tr-TR');

type FillFilter = 'all' | 'full' | 'low' | 'empty';

function fillTone(rate: number): 'ok' | 'warn' | 'danger' | 'muted' {
  if (rate >= 90) return 'danger';
  if (rate >= 60) return 'warn';
  if (rate > 0) return 'ok';
  return 'muted';
}

export default function AkademikIzleme(): React.ReactElement {
  const [term, setTerm] = useState<ActiveTerm | null | undefined>(undefined);
  const [ts, setTs] = useState<TermStats | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [fill, setFill] = useState<FillFilter>('all');
  const [detail, setDetail] = useState<SectionRow | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const activeTerm = await api<ActiveTerm | null>('/calendar/active-term');
        if (!alive) return;
        setTerm(activeTerm);
        if (activeTerm) {
          const [stats, secs] = await Promise.all([
            api<TermStats>(`/enrollment/stats/${activeTerm.id}`).catch(() => null),
            api<{ items: SectionRow[] }>('/portal/sections').catch(() => ({ items: [] as SectionRow[] })),
          ]);
          if (!alive) return;
          setTs(stats);
          setSections(secs.items ?? []);
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : 'Hata');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return sections.filter((s) => {
      if (fill === 'full') return s.enrolled >= s.quota && s.quota > 0;
      if (fill === 'low') return s.quota > 0 && s.fillRate < 40;
      if (fill === 'empty') return s.enrolled === 0;
      return true;
    });
  }, [sections, fill]);

  const statusEntries = ts ? Object.entries(ts.enrollmentsByStatus) : [];
  const fullCount = useMemo(() => sections.filter((s) => s.quota > 0 && s.enrolled >= s.quota).length, [sections]);
  const lowCount = useMemo(() => sections.filter((s) => s.quota > 0 && s.fillRate < 40).length, [sections]);

  if (err) {
    return (
      <>
        <PageHeader title="Akademik İzleme" sub="Aktif dönem kayıt izleme" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }
  if (term === undefined) {
    return (
      <>
        <PageHeader title="Akademik İzleme" />
        <SkeletonStats n={6} />
        <Skeleton lines={6} />
      </>
    );
  }

  if (!term) {
    return (
      <>
        <PageHeader title="Akademik İzleme" sub="Aktif dönem kayıt izleme" />
        <EmptyState
          icon="calendar"
          title="Aktif dönem yok"
          sub="Tenant için şu anda aktif bir akademik dönem tanımlı değil; dönem açıldığında bu ekran canlı doluluk verisiyle dolar."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Akademik İzleme"
        sub={`${term.name} · ${term.startsOn} → ${term.endsOn} · canlı kayıt/doluluk motoru`}
      />

      <StatGrid
        stats={[
          { label: 'Şube', value: ts ? num(ts.sectionCount) : num(sections.length), icon: 'layers' },
          { label: 'Dolu Koltuk', value: ts ? num(ts.totalFilled) : '—', icon: 'users' },
          { label: 'Toplam Kontenjan', value: ts ? num(ts.totalQuota) : '—', icon: 'grid' },
          {
            label: 'Genel Doluluk',
            value: ts ? (ts.fillRate * 100).toFixed(1) + '%' : '—',
            icon: 'activity',
            tone: ts ? (ts.fillRate >= 0.9 ? 'danger' : ts.fillRate >= 0.6 ? 'warn' : 'ok') : undefined,
          },
          { label: 'Dolan Şube', value: num(fullCount), icon: 'checkCircle', tone: fullCount > 0 ? 'warn' : undefined },
          { label: 'Düşük Talep (<%40)', value: num(lowCount), icon: 'alert', tone: lowCount > 0 ? 'warn' : undefined },
        ]}
      />

      {statusEntries.length > 0 && (
        <Card title="Kayıt Durum Dağılımı" icon="chart" hint="Aktif dönemdeki ders kayıtlarının durum makinesi dağılımı">
          <BarChart data={statusEntries.map(([k, v]) => ({ label: k, value: v }))} />
        </Card>
      )}

      <Card
        title="Şube Doluluğu"
        icon="grid"
        hint="Kritik doluluk (%90+) kırmızı · satıra tıklayarak şube detayını açın"
        actions={
          <Segmented
            value={fill}
            onChange={setFill}
            options={[
              { value: 'all', label: 'Tümü' },
              { value: 'full', label: 'Dolan' },
              { value: 'low', label: 'Düşük' },
              { value: 'empty', label: 'Boş' },
            ]}
          />
        }
      >
        <DataTable
          rows={filtered}
          csv
          csvName="sube-dolulugu"
          pageSize={25}
          empty={
            <EmptyState
              icon="grid"
              title={sections.length === 0 ? 'Şube kaydı yok' : 'Süzgece uyan şube yok'}
              sub={sections.length === 0 ? 'Bu dönem için şube kaydı bulunmuyor.' : 'Farklı bir doluluk süzgeci deneyin.'}
            />
          }
          columns={[
            {
              key: 'courseCode',
              header: 'Ders',
              sortable: true,
              value: (s) => `${s.courseCode} ${s.courseName}`,
              render: (s) => (
                <>
                  <b>{s.courseCode}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{s.courseName}</div>
                </>
              ),
            },
            { key: 'sectionCode', header: 'Şube', sortable: true, value: (s) => s.sectionCode },
            {
              key: 'instructorName',
              header: 'Öğr. Elemanı',
              sortable: true,
              value: (s) => s.instructorName ?? '',
              render: (s) => s.instructorName ?? <span className="muted">Atanmadı</span>,
            },
            {
              key: 'doluluk',
              header: 'Doluluk',
              render: (s) => <ProgressBar value={Math.min(100, s.fillRate)} />,
            },
            {
              key: 'enrolled',
              header: 'Dolu / Kont.',
              num: true,
              sortable: true,
              value: (s) => s.enrolled,
              render: (s) => `${num(s.enrolled)} / ${num(s.quota)}`,
            },
            {
              key: 'fillRate',
              header: 'Oran',
              num: true,
              sortable: true,
              value: (s) => s.fillRate,
              render: (s) => <Badge tone={fillTone(s.fillRate)}>{s.fillRate}%</Badge>,
            },
            {
              key: 'isOpen',
              header: 'Durum',
              value: (s) => (s.isOpen ? 'Açık' : 'Dolu'),
              render: (s) => (s.isOpen ? <Badge tone="ok">Açık</Badge> : <Badge tone="danger">Dolu</Badge>),
            },
            {
              key: 'detay',
              header: '',
              render: (s) => (
                <Button variant="ghost" sm icon="eye" onClick={() => setDetail(s)}>
                  Detay
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.courseCode} · ${detail.sectionCode}` : undefined}>
        {detail && (() => {
          const dt = fillTone(detail.fillRate);
          const detailTone = dt === 'muted' ? undefined : dt;
          return (
          <>
            <div className="hint" style={{ marginBottom: 10 }}>{detail.courseName}</div>
            <StatGrid
              stats={[
                { label: 'Dolu Koltuk', value: num(detail.enrolled), icon: 'users' },
                { label: 'Kontenjan', value: num(detail.quota), icon: 'grid' },
                { label: 'Doluluk', value: detail.fillRate + '%', icon: 'activity', tone: detailTone },
                { label: 'Durum', value: detail.isOpen ? 'Açık' : 'Dolu', icon: detail.isOpen ? 'checkCircle' : 'alert', tone: detail.isOpen ? 'ok' : 'danger' },
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <div className="hint" style={{ marginBottom: 4 }}>Kontenjan doluluğu</div>
              <Meter value={Math.min(100, detail.fillRate)} />
            </div>
            <table style={{ marginTop: 14 }}>
              <tbody>
                <tr>
                  <td>Öğr. Elemanı</td>
                  <td style={{ textAlign: 'right' }}>{detail.instructorName ?? <span className="muted">Atanmadı</span>}</td>
                </tr>
                <tr>
                  <td>Boş koltuk</td>
                  <td style={{ textAlign: 'right' }}>
                    <b>{num(Math.max(0, detail.quota - detail.enrolled))}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </>
          );
        })()}
      </Drawer>

      <Alert tone="info">
        Salt-izleme ekranı. Doluluk oranı %90+ kırmızı (kritik doluluk), %60-90 sarı, altı yeşil
        olarak işaretlenir. Kayıt onayları ve şube açma/kapama işlemleri ilgili akademik
        panellerden (ÖİDB / Bölüm) yürütülür.
      </Alert>
    </>
  );
}
