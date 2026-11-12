'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  BarChart,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonStats,
} from '@/app/ui';

interface Grade {
  courseCode: string;
  courseName: string;
  letter: string | null;
  status: string;
  termName: string;
  year: number;
}
interface Me {
  student?: { studentNo: string; program: { name: string }; gpa: number; grades: Grade[] };
}
interface Sched {
  courseCode: string;
  ects: number;
  localCredit: number;
}

// Harf -> 4'lük katsayı. FF/NA/DZ ortalamaya 0 olarak katılır.
const COEF: Record<string, number> = {
  AA: 4, BA: 3.5, BB: 3, CB: 2.5, CC: 2, DC: 1.5, DD: 1,
  FF: 0, NA: 0, DZ: 0, FD: 0,
};
const FAIL = new Set(['FF', 'NA', 'DZ', 'FD']);

// GNO hesaba katılan harfler (nota dönüşen). Muaf/devam (—) hariç.
function counts(letter: string | null): boolean {
  return letter != null && letter in COEF;
}

interface TermAgg {
  termName: string;
  year: number;
  grades: Grade[];
  credit: number;
  ects: number;
  points: number; // Σ katsayı*kredi
  gpa: number; // dönem GNO
}

export default function Ortalamalar(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Record<string, { ects: number; credit: number }>>({});
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([
      api<Me>('/portal/me'),
      api<Sched[]>('/portal/schedule').catch(() => [] as Sched[]),
    ])
      .then(([m, sched]) => {
        setMe(m);
        const map: Record<string, { ects: number; credit: number }> = {};
        for (const s of sched) map[s.courseCode] = { ects: s.ects, credit: s.localCredit };
        setMeta(map);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  if (err)
    return (
      <>
        <PageHeader title="Dönem Ortalamaları" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  if (!me?.student)
    return (
      <>
        <PageHeader title="Dönem Ortalamaları" sub="Ortalamalarınız hesaplanıyor…" />
        <SkeletonStats n={3} />
        <Skeleton lines={6} />
      </>
    );

  const s = me.student;
  // Kredisi bilinmeyen ders için ağırlık 1 (yerel kredi yoksa AKTS'ye, o da yoksa 1'e düşer).
  const creditOf = (code: string): number =>
    meta[code]?.credit || meta[code]?.ects || 1;
  const ectsOf = (code: string): number => meta[code]?.ects ?? 0;

  // Dönemleri (year desc) sırala; grafik/kümülatif için kronolojik (eskiden yeniye) tut.
  const termMap = new Map<string, TermAgg>();
  for (const g of s.grades) {
    const t =
      termMap.get(g.termName) ??
      { termName: g.termName, year: g.year, grades: [], credit: 0, ects: 0, points: 0, gpa: 0 };
    t.grades.push(g);
    if (counts(g.letter)) {
      const cr = creditOf(g.courseCode);
      t.credit += cr;
      t.points += (COEF[g.letter!] ?? 0) * cr;
    }
    t.ects += ectsOf(g.courseCode);
    termMap.set(g.termName, t);
  }
  const terms = [...termMap.values()];
  for (const t of terms) t.gpa = t.credit ? t.points / t.credit : 0;

  // Kronolojik sıralama: year artan, aynı yılda önce Güz sonra Bahar (isim içinde geçerse).
  const seasonRank = (name: string): number =>
    /güz|guz/i.test(name) ? 0 : /bahar/i.test(name) ? 1 : /yaz/i.test(name) ? 2 : 3;
  const chrono = [...terms].sort(
    (a, b) => a.year - b.year || seasonRank(a.termName) - seasonRank(b.termName),
  );

  // Kümülatif GNO (kronolojik).
  const cumGpa = new Map<string, number>();
  let cumPts = 0;
  let cumCr = 0;
  for (const t of chrono) {
    cumPts += t.points;
    cumCr += t.credit;
    cumGpa.set(t.termName, cumCr ? cumPts / cumCr : 0);
  }

  const chart = chrono.map((t) => ({
    label: t.termName.replace(/\s*\d{4}.*/, '').slice(0, 6) || t.termName.slice(0, 6),
    value: Number(t.gpa.toFixed(2)),
  }));

  // Ekranda yeni dönem üstte.
  const display = [...terms].sort(
    (a, b) => b.year - a.year || seasonRank(b.termName) - seasonRank(a.termName),
  );

  const totalCredit = terms.reduce((a, t) => a + t.credit, 0);
  const totalEcts = terms.reduce((a, t) => a + t.ects, 0);

  return (
    <>
      <PageHeader
        title="Dönem Ortalamaları"
        sub={`${s.studentNo} · ${s.program.name} — dönem bazında GNO, kredi ve AKTS.`}
      />

      <StatGrid
        stats={[
          { label: 'Genel GNO', value: s.gpa.toFixed(2), icon: 'award' },
          { label: 'Toplam kredi', value: totalCredit, icon: 'grade' },
          { label: 'Toplam AKTS', value: totalEcts, icon: 'layers' },
        ]}
      />

      {terms.length === 0 ? (
        <Card>
          <EmptyState
            icon="chart"
            title="Ortalama hesaplanacak dönem yok"
            sub="Notlarınız girildikçe dönem ortalamalarınız burada oluşur."
          />
        </Card>
      ) : (
        <>
          <Card
            title="Dönem GNO Trendi"
            icon="chart"
            hint="Her dönemin kendi ağırlıklı ortalaması (4.00 üzerinden)."
          >
            <BarChart data={chart} />
          </Card>

          {display.map((t) => {
            const cum = cumGpa.get(t.termName) ?? 0;
            return (
              <Card
                key={t.termName}
                title={t.termName}
                icon="calendar"
                actions={
                  <Badge tone={t.gpa >= 2 ? 'ok' : 'warn'}>Dönem GNO {t.gpa.toFixed(2)}</Badge>
                }
              >
                <StatGrid
                  stats={[
                    { label: 'Dönem GNO', value: t.gpa.toFixed(2), icon: 'target' },
                    { label: 'Kümülatif GNO', value: cum.toFixed(2), icon: 'award' },
                    { label: 'Kredi', value: t.credit, icon: 'grade' },
                    { label: 'AKTS', value: t.ects, icon: 'layers' },
                  ]}
                />
                <div style={{ marginTop: 12 }}>
                  <DataTable
                    rows={t.grades}
                    search={false}
                    columns={[
                      {
                        key: 'code',
                        header: 'Ders',
                        value: (g) => `${g.courseCode} ${g.courseName}`,
                        render: (g) => (
                          <>
                            <b>{g.courseCode}</b> · {g.courseName}
                          </>
                        ),
                      },
                      {
                        key: 'credit',
                        header: 'Kredi',
                        num: true,
                        value: (g) => (counts(g.letter) ? creditOf(g.courseCode) : -1),
                        render: (g) => (counts(g.letter) ? creditOf(g.courseCode) : '—'),
                      },
                      {
                        key: 'ects',
                        header: 'AKTS',
                        num: true,
                        value: (g) => ectsOf(g.courseCode),
                        render: (g) => ectsOf(g.courseCode) || '—',
                      },
                      {
                        key: 'letter',
                        header: 'Harf',
                        value: (g) => g.letter ?? '',
                        render: (g) =>
                          g.letter ? (
                            <Badge tone={FAIL.has(g.letter) ? 'danger' : 'ok'}>{g.letter}</Badge>
                          ) : (
                            '—'
                          ),
                      },
                      {
                        key: 'coef',
                        header: 'Katsayı',
                        num: true,
                        value: (g) => (counts(g.letter) ? COEF[g.letter!] : -1),
                        render: (g) =>
                          counts(g.letter) ? (COEF[g.letter!] ?? 0).toFixed(2) : '—',
                      },
                    ]}
                  />
                </div>
              </Card>
            );
          })}
        </>
      )}
    </>
  );
}
