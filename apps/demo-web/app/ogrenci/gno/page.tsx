'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Button,
  Alert,
  Donut,
  Skeleton,
} from '@/app/ui';

interface Grade {
  courseName: string;
  letter: string | null;
  status: string;
}
interface Me {
  student?: { gpa: number; grades: Grade[] };
}
const COEF: Record<string, number> = {
  AA: 4, BA: 3.5, BB: 3, CB: 2.5, CC: 2, DC: 1.5, DD: 1, FF: 0,
};

export default function Gno(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<{ ects: number; letter: string }[]>([
    { ects: 6, letter: 'AA' },
  ]);

  useEffect(() => {
    api<Me>('/portal/me')
      .then((m) => {
        setMe(m);
        setLoaded(true);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  const projected = useMemo(() => {
    let pts = 0;
    let cr = 0;
    for (const r of rows) {
      pts += (COEF[r.letter] ?? 0) * r.ects;
      cr += r.ects;
    }
    return cr ? pts / cr : 0;
  }, [rows]);

  if (err)
    return (
      <>
        <PageHeader title="GNO Hesaplama" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  if (!loaded)
    return (
      <>
        <PageHeader title="GNO Hesaplama" sub="Ortalamanız yükleniyor…" />
        <Skeleton lines={4} />
      </>
    );

  const gpa = me?.student?.gpa;
  const totalEcts = rows.reduce((a, r) => a + r.ects, 0);

  return (
    <>
      <PageHeader
        title="GNO Hesaplama"
        sub="Mevcut ortalamanız ve olası ders sonuçlarıyla projeksiyon."
      />

      <StatGrid
        stats={[
          {
            label: 'Güncel GNO (sunucu)',
            value: gpa != null ? gpa.toFixed(2) : '—',
            icon: 'award',
          },
          {
            label: 'Seçilen derslerin ortalaması',
            value: projected.toFixed(2),
            icon: 'target',
            tone: projected >= 2 ? 'ok' : 'warn',
          },
          { label: 'Denenen AKTS', value: totalEcts, icon: 'layers' },
        ]}
      />

      <div className="home-grid">
        <Card title="Deneme Hesaplama" icon="grade" hint="AKTS ve harf notu girerek olası dönem ortalamanızı görün.">
          {rows.map((r, i) => (
            <div className="row" key={i} style={{ marginBottom: 8 }}>
              <input
                type="number"
                min={1}
                value={r.ects}
                onChange={(e) => {
                  const c = [...rows];
                  c[i] = { ...c[i], ects: Number(e.target.value) };
                  setRows(c);
                }}
                style={{ width: 90, padding: 8, border: '1px solid var(--line)', borderRadius: 8 }}
              />
              <select
                value={r.letter}
                onChange={(e) => {
                  const c = [...rows];
                  c[i] = { ...c[i], letter: e.target.value };
                  setRows(c);
                }}
                style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 8 }}
              >
                {Object.keys(COEF).map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              {rows.length > 1 && (
                <Button
                  variant="ghost"
                  sm
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                >
                  Sil
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="ghost"
            sm
            icon="edit"
            onClick={() => setRows([...rows, { ects: 6, letter: 'AA' }])}
          >
            Ders ekle
          </Button>
        </Card>

        <Card title="Projeksiyon" icon="pie" hint="Seçilen derslerin ortalaması (4.00 üzerinden).">
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
            <Donut value={(projected / 4) * 100} />
          </div>
          <p className="hint" style={{ textAlign: 'center' }}>
            {projected.toFixed(2)} / 4.00
          </p>
        </Card>
      </div>
    </>
  );
}
