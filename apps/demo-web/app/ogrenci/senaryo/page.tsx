'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Button,
  Alert,
  Skeleton,
  SkeletonStats,
  EmptyState,
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

const COEF: Record<string, number> = {
  AA: 4, BA: 3.5, BB: 3, CB: 2.5, CC: 2, DC: 1.5, DD: 1,
  FF: 0, NA: 0, DZ: 0, FD: 0,
};
const LETTERS = ['AA', 'BA', 'BB', 'CB', 'CC', 'DC', 'DD', 'FF'];
// GNO'ya katılan (nota dönüşen) harfler.
const GRADED = new Set(Object.keys(COEF));

export default function Senaryo(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Record<string, number>>({}); // courseCode -> ağırlık (kredi)
  const [err, setErr] = useState('');
  const [pick, setPick] = useState<Record<string, string>>({}); // key -> tahmini harf

  useEffect(() => {
    Promise.all([
      api<Me>('/portal/me'),
      api<Sched[]>('/portal/schedule').catch(() => [] as Sched[]),
    ])
      .then(([m, sched]) => {
        setMe(m);
        const map: Record<string, number> = {};
        for (const s of sched) map[s.courseCode] = s.localCredit || s.ects || 1;
        setMeta(map);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  const grades = me?.student?.grades ?? [];
  const keyOf = (g: Grade, i: number): string => `${g.termName}::${g.courseCode}::${i}`;
  const weightOf = (code: string): number => meta[code] || 1;

  // Mevcut AGNO (yalnız nota dönüşen dersler).
  const currentCalc = useMemo(() => {
    let pts = 0;
    let cr = 0;
    for (const g of grades) {
      if (g.letter && GRADED.has(g.letter)) {
        const w = weightOf(g.courseCode);
        pts += (COEF[g.letter] ?? 0) * w;
        cr += w;
      }
    }
    return cr ? pts / cr : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grades, meta]);

  // Senaryo AGNO: her ders için seçili harf (yoksa gerçek harf); harf yoksa (henüz notu yok) hariç.
  const scenarioCalc = useMemo(() => {
    let pts = 0;
    let cr = 0;
    grades.forEach((g, i) => {
      const chosen = pick[keyOf(g, i)] ?? g.letter ?? '';
      if (chosen && GRADED.has(chosen)) {
        const w = weightOf(g.courseCode);
        pts += (COEF[chosen] ?? 0) * w;
        cr += w;
      }
    });
    return cr ? pts / cr : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grades, meta, pick]);

  if (err)
    return (
      <>
        <PageHeader title="Transkript Senaryosu" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  if (!me?.student)
    return (
      <>
        <PageHeader title="Transkript Senaryosu" sub="Notlarınız yükleniyor…" />
        <SkeletonStats n={3} />
        <Skeleton lines={6} />
      </>
    );

  const s = me.student;
  const serverGpa = s.gpa;
  const delta = scenarioCalc - serverGpa;

  // Dönem dönem grupla (görüntü: yeni üstte).
  const byTerm = new Map<string, { g: Grade; idx: number }[]>();
  grades.forEach((g, i) => {
    const arr = byTerm.get(g.termName) ?? [];
    arr.push({ g, idx: i });
    byTerm.set(g.termName, arr);
  });
  const termList = [...byTerm.entries()].sort((a, b) => {
    const ya = a[1][0].g.year;
    const yb = b[1][0].g.year;
    return yb - ya;
  });

  const dirty = Object.keys(pick).length > 0;

  return (
    <>
      <PageHeader
        title="Transkript Senaryosu"
        sub={`${s.studentNo} · ${s.program.name} — her ders için tahmini harf notu seçerek olası AGNO'nuzu görün.`}
        actions={
          dirty ? (
            <Button variant="ghost" sm icon="refresh" onClick={() => setPick({})}>
              Sıfırla
            </Button>
          ) : undefined
        }
      />

      <Alert tone="info">
        Bu sayfa tamamen tarayıcınızda çalışır; hiçbir değişiklik kaydedilmez ve{' '}
        <b>gerçek notunuza / transkriptinize etki etmez</b>. Sadece &ldquo;ne olurdu&rdquo;
        senaryosudur.
      </Alert>

      <StatGrid
        stats={[
          { label: 'Mevcut AGNO (sunucu)', value: serverGpa.toFixed(2), icon: 'award' },
          {
            label: 'Senaryo AGNO',
            value: scenarioCalc.toFixed(2),
            icon: 'target',
            tone: scenarioCalc >= 2 ? 'ok' : 'warn',
          },
          {
            label: 'Fark (delta)',
            value: `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`,
            icon: delta >= 0 ? 'arrowUp' : 'arrowDown',
            tone: delta > 0.001 ? 'ok' : delta < -0.001 ? 'danger' : undefined,
          },
        ]}
      />

      {grades.length === 0 ? (
        <Card>
          <EmptyState
            icon="grade"
            title="Senaryo kurulacak ders yok"
            sub="Ders kaydınız oluştukça burada tahmini notlarla oynayabilirsiniz."
          />
        </Card>
      ) : (
        termList.map(([termName, items]) => (
          <Card key={termName} title={termName} icon="calendar">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ders Kodu</th>
                    <th>Ders Adı</th>
                    <th className="num">Kredi</th>
                    <th>Gerçek</th>
                    <th>Tahmini</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ g, idx }) => {
                    const k = keyOf(g, idx);
                    const chosen = pick[k] ?? g.letter ?? '';
                    return (
                      <tr key={k}>
                        <td>
                          <b>{g.courseCode}</b>
                        </td>
                        <td>{g.courseName}</td>
                        <td className="num">{weightOf(g.courseCode)}</td>
                        <td>
                          {g.letter ? (
                            <Badge tone={g.letter === 'FF' ? 'danger' : 'muted'}>{g.letter}</Badge>
                          ) : (
                            <span className="muted" style={{ fontSize: 12 }}>
                              notu yok
                            </span>
                          )}
                        </td>
                        <td>
                          <select
                            value={chosen}
                            onChange={(e) =>
                              setPick((p) => ({ ...p, [k]: e.target.value }))
                            }
                            style={{
                              padding: 6,
                              border: '1px solid var(--line)',
                              borderRadius: 8,
                              background: 'var(--card)',
                              color: 'var(--text)',
                            }}
                          >
                            <option value="">—</option>
                            {LETTERS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}

      <p className="muted" style={{ fontSize: 12 }}>
        Hesaplama 4&apos;lük sisteme göredir (AA 4.00 … DD 1.00, FF/NA/DZ 0.00). Kredisi bilinmeyen
        dersler için ağırlık 1 alınır. Sonuç yaklaşık bir projeksiyondur.
      </p>
    </>
  );
}
