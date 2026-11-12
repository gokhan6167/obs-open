'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
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
}
interface Me {
  student?: { studentNo: string; program: { name: string }; gpa: number; grades: Grade[] };
}

const FAIL = new Set(['FF', 'NA', 'DZ', 'FD']);

export default function Transkript(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<Me>('/portal/me')
      .then(setMe)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  if (err)
    return (
      <>
        <PageHeader title="Transkript" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  if (!me?.student)
    return (
      <>
        <PageHeader title="Transkript" sub="Not dökümünüz yükleniyor…" />
        <SkeletonStats n={3} />
        <Skeleton lines={6} />
      </>
    );
  const s = me.student;
  const terms = [...new Set(s.grades.map((g) => g.termName))];
  const graded = s.grades.filter((g) => g.letter);
  const passed = graded.filter((g) => !FAIL.has(g.letter!)).length;

  return (
    <>
      <PageHeader
        title="Transkript"
        sub={`${s.studentNo} · ${s.program.name}`}
      />

      <StatGrid
        stats={[
          { label: 'GNO', value: s.gpa.toFixed(2), icon: 'award' },
          { label: 'Toplam ders', value: s.grades.length, icon: 'book' },
          {
            label: 'Geçilen ders',
            value: `${passed}/${graded.length}`,
            icon: 'checkCircle',
            tone: 'ok',
          },
        ]}
      />

      {terms.length === 0 ? (
        <Card>
          <EmptyState
            icon="grade"
            title="Henüz not girişi yok"
            sub="Not dökümünüz öğretim elemanları not girdikçe oluşur."
          />
        </Card>
      ) : (
        terms.map((t) => (
          <Card key={t} title={t} icon="calendar">
            <DataTable
              rows={s.grades.filter((g) => g.termName === t)}
              search={false}
              columns={[
                {
                  key: 'code',
                  header: 'Ders Kodu',
                  value: (g) => g.courseCode,
                  render: (g) => <b>{g.courseCode}</b>,
                },
                { key: 'name', header: 'Ders Adı', value: (g) => g.courseName },
                {
                  key: 'score',
                  header: 'Puan',
                  num: true,
                  value: (g) => g.rawScore ?? -1,
                  render: (g) => (g.rawScore ?? '—'),
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
              ]}
            />
          </Card>
        ))
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        Bu belge doğrulama kodu ile teyit edilebilir (resmi çıktıda QR + kod yer alır).
      </p>
    </>
  );
}
