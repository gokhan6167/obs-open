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
  Skeleton,
  SkeletonStats,
  EmptyState,
  Segmented,
  Donut,
  BarChart,
  type Stat,
} from '@/app/ui';

/* ---------------------------------------------------------------------------
   Rapor Merkezi — OİDB istatistik motoru (17 istatistik) burada canlı veriden
   özetlenir. Kaynaklar: GET /portal/students?pageSize=100 (öğrenci listesi),
   GET /reports/dashboard (genel KPI), GET /reports/students-by-program.
   Not: "Kayıt Yılı" dağılımı, öğrenci numarasının ilk 4 hanesinden türetilir
   (yaygın OBS konvansiyonu); ayrı bir uç bulunmadığından bu bir türetimdir.
--------------------------------------------------------------------------- */

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | null;
}

interface Dashboard {
  studentCount: number;
  activeStudents: number;
  graduatedStudents: number;
  totalEnrollments: number;
  collectedAmount: number;
}

interface ProgramRow {
  program: string;
  count: number;
}

type ReportKind = 'durum' | 'program' | 'gno' | 'yil';

const REPORTS: { value: ReportKind; label: string }[] = [
  { value: 'durum', label: 'Durum Dağılımı' },
  { value: 'program', label: 'Program Dağılımı' },
  { value: 'gno', label: 'GNO Dağılımı' },
  { value: 'yil', label: 'Kayıt Yılı' },
];

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  kayit_dondurma: 'Kayıt Donduruldu',
  pasif: 'Pasif',
  iliskigi_kesildi: 'İlişiği Kesildi',
  mezun: 'Mezun',
  azami_sure_doldu: 'Azami Süre Doldu',
  af_ogrencisi: 'Af Öğrencisi',
};
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  aktif: 'ok',
  mezun: 'ok',
  kayit_dondurma: 'warn',
  af_ogrencisi: 'warn',
  azami_sure_doldu: 'warn',
  pasif: 'muted',
  iliskigi_kesildi: 'danger',
};
const STATUS_ORDER = [
  'aktif',
  'kayit_dondurma',
  'pasif',
  'af_ogrencisi',
  'azami_sure_doldu',
  'iliskigi_kesildi',
  'mezun',
];

// GNO aralıkları (kümülatif değil; her öğrenci tek aralığa düşer).
const GNO_BANDS: { key: string; label: string; test: (g: number) => boolean }[] = [
  { key: '0-2', label: '0,00 – 2,00', test: (g) => g < 2 },
  { key: '2-3', label: '2,00 – 3,00', test: (g) => g >= 2 && g < 3 },
  { key: '3-4', label: '3,00 – 4,00', test: (g) => g >= 3 },
];

interface DistRow {
  key: string;
  label: string;
  count: number;
}

const fmtGpa = (g: number | null): string =>
  g == null ? '—' : g.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RaporMerkeziPage(): React.ReactElement {
  const [kind, setKind] = useState<ReportKind>('durum');
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [byProgram, setByProgram] = useState<ProgramRow[] | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, d, p] = await Promise.all([
        api<{ items: StudentRow[]; total: number }>('/portal/students?pageSize=100'),
        api<Dashboard>('/reports/dashboard'),
        api<ProgramRow[]>('/reports/students-by-program'),
      ]);
      if (!alive) return;
      setStudents(s.items ?? []);
      setTotal(s.total ?? s.items?.length ?? 0);
      setDash(d);
      setByProgram(p);
    })()
      .catch((e) => alive && setErr(e instanceof Error ? e.message : 'Raporlar yüklenemedi.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Durum dağılımı — canlı öğrenci listesinden sayılır.
  const statusDist = useMemo<DistRow[]>(() => {
    if (!students) return [];
    const c = new Map<string, number>();
    for (const s of students) c.set(s.status, (c.get(s.status) ?? 0) + 1);
    const rows: DistRow[] = STATUS_ORDER.filter((k) => c.has(k)).map((k) => ({
      key: k,
      label: STATUS_TR[k] ?? k,
      count: c.get(k) ?? 0,
    }));
    for (const [k, n] of c) {
      if (!STATUS_ORDER.includes(k)) rows.push({ key: k, label: STATUS_TR[k] ?? k, count: n });
    }
    return rows;
  }, [students]);

  // Program dağılımı — ayrı uçtan (students-by-program).
  const programDist = useMemo<DistRow[]>(
    () =>
      (byProgram ?? [])
        .map((r) => ({ key: r.program, label: r.program, count: r.count }))
        .sort((a, b) => b.count - a.count),
    [byProgram],
  );

  // GNO dağılımı — GNO'su olan öğrenciler aralıklara ayrılır.
  const gnoDist = useMemo<DistRow[]>(() => {
    if (!students) return [];
    return GNO_BANDS.map((b) => ({
      key: b.key,
      label: b.label,
      count: students.filter((s) => s.gpa != null && b.test(s.gpa)).length,
    }));
  }, [students]);

  // Kayıt yılı — öğrenci numarasının ilk 4 hanesinden türetilir.
  const yearDist = useMemo<DistRow[]>(() => {
    if (!students) return [];
    const c = new Map<string, number>();
    for (const s of students) {
      const m = /^(\d{4})/.exec(s.studentNo ?? '');
      const y = m ? m[1] : 'Bilinmiyor';
      c.set(y, (c.get(y) ?? 0) + 1);
    }
    return [...c.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
      .map(([y, n]) => ({ key: y, label: y, count: n }));
  }, [students]);

  const active = useMemo(() => {
    switch (kind) {
      case 'program':
        return programDist;
      case 'gno':
        return gnoDist;
      case 'yil':
        return yearDist;
      default:
        return statusDist;
    }
  }, [kind, statusDist, programDist, gnoDist, yearDist]);

  const gnoMissing = useMemo(
    () => (students ? students.filter((s) => s.gpa == null).length : 0),
    [students],
  );

  const stats = useMemo<Stat[]>(() => {
    if (!students || !dash) return [];
    switch (kind) {
      case 'durum':
        return [
          { label: 'Öğrenci (özet)', value: students.length, icon: 'users' },
          { label: 'Aktif', value: dash.activeStudents, icon: 'checkCircle', tone: 'ok' },
          { label: 'Mezun', value: dash.graduatedStudents, icon: 'award' },
          { label: 'Toplam öğrenci', value: dash.studentCount, icon: 'layers' },
        ];
      case 'program': {
        const top = programDist[0];
        return [
          { label: 'Program sayısı', value: programDist.length, icon: 'grid' },
          { label: 'En kalabalık', value: top ? top.count : 0, icon: 'users' },
          {
            label: 'En kalabalık program',
            value: top ? top.label : '—',
            icon: 'award',
          },
          { label: 'Toplam öğrenci', value: dash.studentCount, icon: 'layers' },
        ];
      }
      case 'gno': {
        const rated = students.filter((s) => s.gpa != null);
        const avg = rated.length
          ? rated.reduce((a, s) => a + (s.gpa ?? 0), 0) / rated.length
          : 0;
        return [
          { label: 'GNO’lu öğrenci', value: rated.length, icon: 'grade' },
          {
            label: 'Ortalama GNO',
            value: fmtGpa(rated.length ? avg : null),
            icon: 'chart',
          },
          {
            label: 'GNO ≥ 3,00',
            value: rated.filter((s) => (s.gpa ?? 0) >= 3).length,
            icon: 'checkCircle',
            tone: 'ok',
          },
          {
            label: 'GNO < 2,00',
            value: rated.filter((s) => (s.gpa ?? 0) < 2).length,
            icon: 'alert',
            tone: 'danger',
          },
        ];
      }
      case 'yil':
        return [
          { label: 'Kayıt yılı sayısı', value: yearDist.length, icon: 'calendar' },
          {
            label: 'En kalabalık yıl',
            value: yearDist.reduce((m, r) => (r.count > m.count ? r : m), yearDist[0] ?? { label: '—', count: 0 }).label,
            icon: 'flag',
          },
          {
            label: 'Son giriş yılı',
            value: yearDist.length ? yearDist[yearDist.length - 1].label : '—',
            icon: 'arrowUp',
          },
          { label: 'Öğrenci (özet)', value: students.length, icon: 'users' },
        ];
      default:
        return [];
    }
  }, [kind, students, dash, programDist, yearDist]);

  const chartData = useMemo(
    () => active.map((d) => ({ label: d.label, value: d.count })),
    [active],
  );

  const csvName = `oidb-rapor-${kind}`;
  const useDonut = kind === 'durum';
  const activeShare = useMemo(() => {
    if (!dash || dash.studentCount === 0) return 0;
    return (dash.activeStudents / dash.studentCount) * 100;
  }, [dash]);

  if (loading) {
    return (
      <>
        <PageHeader title="Rapor Merkezi" sub="OİDB istatistik motorunun canlı veriden özeti." />
        <SkeletonStats n={4} />
        <Skeleton lines={8} />
      </>
    );
  }

  if (err) {
    return (
      <>
        <PageHeader title="Rapor Merkezi" sub="OİDB istatistik motorunun canlı veriden özeti." />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }

  if (!students || students.length === 0) {
    return (
      <>
        <PageHeader title="Rapor Merkezi" sub="OİDB istatistik motorunun canlı veriden özeti." />
        <Card title="Rapor tipi" icon="chart">
          <EmptyState
            icon="users"
            title="Öğrenci verisi bulunamadı"
            sub="Raporlar öğrenci listesinden hesaplanır; henüz kayıtlı öğrenci yok."
          />
        </Card>
      </>
    );
  }

  const truncated = total > students.length;

  return (
    <>
      <PageHeader
        title="Rapor Merkezi"
        sub="OİDB istatistik motorundaki 17 istatistiğin canlı veriden özeti."
        actions={
          <Segmented<ReportKind> value={kind} onChange={setKind} options={REPORTS} />
        }
      />

      {truncated && (
        <Alert tone="info">
          Öğrenci bazlı raporlar (durum, GNO, kayıt yılı) ilk {students.length} kayıt
          üzerinden özetlenir. Kurumda toplam {total} öğrenci bulunuyor.
        </Alert>
      )}
      {kind === 'yil' && (
        <Alert tone="info">
          Kayıt yılı, öğrenci numarasının ilk 4 hanesinden türetilmiştir (ayrı bir uç
          bulunmadığından yaklaşık değerdir).
        </Alert>
      )}

      <StatGrid stats={stats} />

      <div className="two-col">
        <Card
          title={REPORTS.find((r) => r.value === kind)?.label}
          icon={useDonut ? 'pie' : 'chart'}
          hint={useDonut ? 'Aktif öğrenci oranı' : 'Dağılım grafiği'}
        >
          {chartData.length === 0 ? (
            <EmptyState icon="chart" title="Bu rapor için veri yok" />
          ) : useDonut ? (
            <div className="row" style={{ gap: 20, alignItems: 'center', marginBottom: 0 }}>
              <Donut value={activeShare} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {dash?.activeStudents ?? 0} / {dash?.studentCount ?? 0}
                </div>
                {statusDist.map((d) => (
                  <div className="muted" key={d.key}>
                    {d.label} · {d.count}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <BarChart data={chartData} />
          )}
        </Card>

        <Card title="Kaynak uçlar" icon="info" hint="Bu ekranın beslendiği canlı veriler">
          <div className="muted" style={{ lineHeight: 1.9 }}>
            <div>
              <b>GET</b> /portal/students?pageSize=100 · durum, GNO, kayıt yılı
            </div>
            <div>
              <b>GET</b> /reports/dashboard · genel KPI (aktif / mezun / toplam)
            </div>
            <div>
              <b>GET</b> /reports/students-by-program · program dağılımı
            </div>
            {kind === 'gno' && gnoMissing > 0 && (
              <div style={{ marginTop: 8 }}>
                GNO’su girilmemiş {gnoMissing} öğrenci aralıklara dahil edilmedi.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card
        title={`${REPORTS.find((r) => r.value === kind)?.label} — tablo`}
        icon="grid"
        hint="Sağdaki CSV ile dışa aktarabilirsiniz."
      >
        <DataTable<DistRow>
          rows={active}
          search={false}
          csv
          csvName={csvName}
          empty={<EmptyState icon="chart" title="Bu rapor için veri yok" />}
          columns={[
            {
              key: 'label',
              header:
                kind === 'durum'
                  ? 'Durum'
                  : kind === 'program'
                    ? 'Program'
                    : kind === 'gno'
                      ? 'GNO Aralığı'
                      : 'Kayıt Yılı',
              sortable: true,
              value: (r) => r.label,
              render: (r) =>
                kind === 'durum' ? (
                  <Badge tone={STATUS_TONE[r.key] ?? 'muted'}>{r.label}</Badge>
                ) : (
                  r.label
                ),
            },
            {
              key: 'count',
              header: 'Öğrenci',
              num: true,
              sortable: true,
              value: (r) => r.count,
            },
            {
              key: 'pct',
              header: 'Oran',
              num: true,
              sortable: true,
              value: (r) => {
                const t = active.reduce((a, x) => a + x.count, 0);
                return t ? Math.round((r.count / t) * 1000) / 10 : 0;
              },
              render: (r) => {
                const t = active.reduce((a, x) => a + x.count, 0);
                return t ? `%${(Math.round((r.count / t) * 1000) / 10).toLocaleString('tr-TR')}` : '—';
              },
            },
          ]}
        />
      </Card>
    </>
  );
}
