'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Drawer,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonStats,
} from '@/app/ui';

interface Grade {
  courseCode: string;
  courseName: string;
  letter: string | null;
  rawScore: number | null;
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
  theoryHours: number;
  practiceHours: number;
  labHours: number;
}
interface Meta {
  ects: number;
  localCredit: number;
  theoryHours: number;
  practiceHours: number;
  labHours: number;
}

const FAIL = new Set(['FF', 'NA', 'DZ', 'FD']);
const STATUS_TR: Record<string, string> = {
  passed: 'Geçti',
  failed: 'Kaldı',
  ongoing: 'Devam',
  in_progress: 'Devam',
  active: 'Devam',
  registered: 'Kayıtlı',
  withdrawn: 'Çekildi',
};
function statusTone(g: Grade): 'ok' | 'danger' | 'warn' | 'muted' | 'info' {
  if (g.letter) return FAIL.has(g.letter) ? 'danger' : 'ok';
  return 'info';
}

export default function AlinanDersler(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([
      api<Me>('/portal/me'),
      api<Sched[]>('/portal/schedule').catch(() => [] as Sched[]),
    ])
      .then(([m, sched]) => {
        setMe(m);
        const map: Record<string, Meta> = {};
        for (const s of sched) {
          map[s.courseCode] = {
            ects: s.ects,
            localCredit: s.localCredit,
            theoryHours: s.theoryHours,
            practiceHours: s.practiceHours,
            labHours: s.labHours,
          };
        }
        setMeta(map);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  const [open, setOpen] = useState<Grade | null>(null);

  if (err)
    return (
      <>
        <PageHeader title="Alınan Dersler" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  if (!me?.student)
    return (
      <>
        <PageHeader title="Alınan Dersler" sub="Ders geçmişiniz yükleniyor…" />
        <SkeletonStats n={3} />
        <Skeleton lines={6} />
      </>
    );

  const s = me.student;
  const grades = s.grades;
  const totalCredit = grades.reduce((a, g) => a + (meta[g.courseCode]?.localCredit ?? 0), 0);
  const totalEcts = grades.reduce((a, g) => a + (meta[g.courseCode]?.ects ?? 0), 0);

  // Dönem dönem grupla (year desc, aynı yılda termName).
  const byTerm = new Map<string, Grade[]>();
  for (const g of grades) {
    const arr = byTerm.get(g.termName) ?? [];
    arr.push(g);
    byTerm.set(g.termName, arr);
  }

  const active = open ? meta[open.courseCode] : undefined;

  return (
    <>
      <PageHeader
        title="Alınan Dersler"
        sub={`${s.studentNo} · ${s.program.name} — dönem dönem aldığınız dersler. Detay için satıra tıklayın.`}
      />

      <StatGrid
        stats={[
          { label: 'Toplam ders', value: grades.length, icon: 'book' },
          { label: 'Toplam kredi', value: totalCredit, icon: 'grade' },
          { label: 'Toplam AKTS', value: totalEcts, icon: 'layers' },
        ]}
      />

      {grades.length === 0 ? (
        <Card>
          <EmptyState
            icon="book"
            title="Henüz alınan ders yok"
            sub="Ders kaydınız oluştukça burada dönem dönem listelenir."
          />
        </Card>
      ) : (
        Array.from(byTerm.entries()).map(([termName, list]) => (
          <Card key={termName} title={termName} icon="calendar">
            <DataTable
              rows={list}
              search
              columns={[
                {
                  key: 'code',
                  header: 'Ders Kodu',
                  value: (g) => g.courseCode,
                  render: (g) => (
                    <a
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpen(g)}
                      onKeyDown={(e) => e.key === 'Enter' && setOpen(g)}
                      style={{ cursor: 'pointer', color: 'var(--accent)' }}
                    >
                      <b>{g.courseCode}</b>
                    </a>
                  ),
                },
                { key: 'name', header: 'Ders Adı', value: (g) => g.courseName },
                {
                  key: 'credit',
                  header: 'Kredi',
                  num: true,
                  value: (g) => meta[g.courseCode]?.localCredit ?? -1,
                  render: (g) => meta[g.courseCode]?.localCredit ?? '—',
                },
                {
                  key: 'ects',
                  header: 'AKTS',
                  num: true,
                  value: (g) => meta[g.courseCode]?.ects ?? -1,
                  render: (g) => meta[g.courseCode]?.ects ?? '—',
                },
                {
                  key: 'score',
                  header: 'Puan',
                  num: true,
                  value: (g) => g.rawScore ?? -1,
                  render: (g) => g.rawScore ?? '—',
                },
                {
                  key: 'letter',
                  header: 'Harf',
                  value: (g) => g.letter ?? '',
                  render: (g) =>
                    g.letter ? (
                      <Badge tone={FAIL.has(g.letter) ? 'danger' : 'ok'}>{g.letter}</Badge>
                    ) : (
                      <Badge tone="info">{STATUS_TR[g.status] ?? 'Devam'}</Badge>
                    ),
                },
                {
                  key: 'view',
                  header: '',
                  sortable: false,
                  render: (g) => (
                    <Button variant="subtle" sm icon="eye" onClick={() => setOpen(g)}>
                      Detay
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        ))
      )}

      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `${open.courseCode} · ${open.courseName}` : ''}
      >
        {open && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <Badge tone={statusTone(open)}>
                {open.letter ?? STATUS_TR[open.status] ?? 'Devam ediyor'}
              </Badge>
            </div>

            <div className="meta" style={{ marginBottom: 6 }}>
              Dönem
            </div>
            <p style={{ marginBottom: 16, fontSize: 13 }}>
              {open.termName} · {open.year}
            </p>

            <div className="meta" style={{ marginBottom: 6 }}>
              Kredi ve AKTS
            </div>
            <table style={{ marginBottom: 16 }}>
              <tbody>
                <tr>
                  <td>Yerel kredi</td>
                  <td style={{ textAlign: 'right' }}>{active?.localCredit ?? '—'}</td>
                </tr>
                <tr>
                  <td>AKTS</td>
                  <td style={{ textAlign: 'right' }}>{active?.ects ?? '—'}</td>
                </tr>
              </tbody>
            </table>

            <div className="meta" style={{ marginBottom: 6 }}>
              Haftalık ders saati (T-U-L)
            </div>
            <table style={{ marginBottom: 16 }}>
              <tbody>
                <tr>
                  <td>Teorik</td>
                  <td style={{ textAlign: 'right' }}>{active?.theoryHours ?? '—'} sa</td>
                </tr>
                <tr>
                  <td>Uygulama</td>
                  <td style={{ textAlign: 'right' }}>{active?.practiceHours ?? '—'} sa</td>
                </tr>
                <tr>
                  <td>Laboratuvar</td>
                  <td style={{ textAlign: 'right' }}>{active?.labHours ?? '—'} sa</td>
                </tr>
              </tbody>
            </table>

            <div className="meta" style={{ marginBottom: 6 }}>
              Not
            </div>
            <table>
              <tbody>
                <tr>
                  <td>Puan</td>
                  <td style={{ textAlign: 'right' }}>{open.rawScore ?? '—'}</td>
                </tr>
                <tr>
                  <td>Harf notu</td>
                  <td style={{ textAlign: 'right' }}>{open.letter ?? '—'}</td>
                </tr>
              </tbody>
            </table>

            {!active && (
              <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
                Kredi/saat bilgisi yalnızca aktif ders programındaki dersler için gösterilir.
              </p>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
