'use client';
import { useEffect, useState } from 'react';
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

interface Me {
  student?: { studentNo: string; program: { name: string }; gpa: number };
}
interface Sched {
  courseCode: string;
  courseName: string;
  ects: number;
  localCredit: number;
}

// Harf -> 4'lük katsayı.
const COEF: Record<string, number> = {
  AA: 4, BA: 3.5, BB: 3, CB: 2.5, CC: 2, DC: 1.5, DD: 1, FD: 0.5, FF: 0,
};
const LETTERS = ['AA', 'BA', 'BB', 'CB', 'CC', 'DC', 'DD', 'FD', 'FF'];

export default function GnoSimulasyon(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [sched, setSched] = useState<Sched[] | null>(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState<Record<string, string>>({}); // courseCode -> tahmini harf
  const [result, setResult] = useState<{ sim: number; delta: number } | null>(null);

  useEffect(() => {
    Promise.all([
      api<Me>('/portal/me'),
      api<Sched[]>('/portal/schedule').catch(() => [] as Sched[]),
    ])
      .then(([m, s]) => {
        setMe(m);
        setSched(s);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  if (err)
    return (
      <>
        <PageHeader title="GNO Simülasyonu" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  if (!me?.student || sched == null)
    return (
      <>
        <PageHeader title="GNO Simülasyonu" sub="Bilgileriniz yükleniyor…" />
        <SkeletonStats n={2} />
        <Skeleton lines={6} />
      </>
    );

  const s = me.student;
  const currentGpa = s.gpa;
  const weightOf = (c: Sched): number => c.localCredit || c.ects || 1;
  const dirty = Object.keys(pick).length > 0;

  // Simülasyon GNO: mevcut GNO'nun ağırlığı bilinmediğinden, seçilen aktif ders
  // notlarını mevcut GNO ile birlikte ağırlıklı ortalar. Yalnız harf seçilen dersler katılır.
  const hesapla = (): void => {
    let pts = 0;
    let cr = 0;
    for (const c of sched) {
      const chosen = pick[c.courseCode];
      if (chosen && chosen in COEF) {
        const w = weightOf(c);
        pts += COEF[chosen] * w;
        cr += w;
      }
    }
    const sim = cr ? pts / cr : currentGpa;
    setResult({ sim, delta: sim - currentGpa });
  };

  const reset = (): void => {
    setPick({});
    setResult(null);
  };

  return (
    <>
      <PageHeader
        title="GNO Simülasyonu"
        sub={`${s.studentNo} · ${s.program.name} — aktif dönem dersleriniz için varsayımsal harf notları girerek olası GNO'nuzu görün.`}
        actions={
          dirty ? (
            <Button variant="ghost" sm icon="refresh" onClick={reset}>
              Sıfırla
            </Button>
          ) : undefined
        }
      />

      <Alert tone="info">
        Bu araç yalnızca <b>aktif dönem derslerinizi</b> kullanır ve tamamen tarayıcınızda çalışır;
        hiçbir değişiklik <b>kaydedilmez</b> ve gerçek transkriptinize etki etmez.
      </Alert>

      <StatGrid
        stats={[
          { label: 'Mevcut GNO', value: currentGpa.toFixed(2), icon: 'award' },
          {
            label: 'Simülasyon GNO',
            value: result ? result.sim.toFixed(2) : '—',
            icon: 'target',
            tone: result ? (result.sim >= 2 ? 'ok' : 'warn') : undefined,
          },
          {
            label: 'Fark (delta)',
            value: result ? `${result.delta >= 0 ? '+' : ''}${result.delta.toFixed(2)}` : '—',
            icon: result && result.delta < 0 ? 'arrowDown' : 'arrowUp',
            tone: result
              ? result.delta > 0.001
                ? 'ok'
                : result.delta < -0.001
                  ? 'danger'
                  : undefined
              : undefined,
          },
        ]}
      />

      {sched.length === 0 ? (
        <Card>
          <EmptyState
            icon="grade"
            title="Aktif dönem dersiniz yok"
            sub="Ders kaydınız oluştuğunda burada varsayımsal notlarla GNO simülasyonu yapabilirsiniz."
          />
        </Card>
      ) : (
        <Card
          title="Aktif Dönem Dersleri"
          icon="calendar"
          actions={
            <Button icon="target" onClick={hesapla}>
              Hesapla
            </Button>
          }
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ders Kodu</th>
                  <th>Ders Adı</th>
                  <th className="num">Kredi</th>
                  <th className="num">AKTS</th>
                  <th>Varsayımsal Not</th>
                </tr>
              </thead>
              <tbody>
                {sched.map((c) => {
                  const chosen = pick[c.courseCode] ?? '';
                  return (
                    <tr key={c.courseCode}>
                      <td>
                        <b>{c.courseCode}</b>
                      </td>
                      <td>{c.courseName}</td>
                      <td className="num">{c.localCredit || '—'}</td>
                      <td className="num">{c.ects || '—'}</td>
                      <td>
                        <select
                          value={chosen}
                          onChange={(e) =>
                            setPick((p) => ({ ...p, [c.courseCode]: e.target.value }))
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
                              {l} ({COEF[l].toFixed(1)})
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
      )}

      {result && (
        <Card title="Sonuç" icon="award">
          <p style={{ margin: 0 }}>
            Seçtiğiniz varsayımsal notlarla olası GNO&apos;nuz{' '}
            <Badge tone={result.sim >= 2 ? 'ok' : 'warn'} noDot>
              {result.sim.toFixed(2)}
            </Badge>{' '}
            olur. Mevcut GNO&apos;nuza ({currentGpa.toFixed(2)}) göre değişim{' '}
            <Badge
              tone={result.delta > 0.001 ? 'ok' : result.delta < -0.001 ? 'danger' : 'muted'}
              noDot
            >
              {result.delta >= 0 ? '+' : ''}
              {result.delta.toFixed(2)}
            </Badge>
            .
          </p>
        </Card>
      )}

      <p className="muted" style={{ fontSize: 12 }}>
        Hesaplama 4&apos;lük sisteme göredir (AA 4.00 · BA 3.50 · BB 3.00 · CB 2.50 · CC 2.00 · DC
        1.50 · DD 1.00 · FD 0.50 · FF 0.00) ve AKTS/kredi ağırlıklıdır. Yalnız harf seçtiğiniz aktif
        dersler hesaba katılır; sonuç yaklaşık bir projeksiyondur ve kalıcı değildir.
      </p>
    </>
  );
}
