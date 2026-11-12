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
  EmptyState,
  Skeleton,
  SkeletonStats,
  ProgressBar,
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
  student?: {
    studentNo: string;
    gpa: number;
    program: { name: string };
    grades: Grade[];
  };
}

// Geçer sayılmayan harfler (başarısız / devamsız).
const FAIL = new Set(['FF', 'FD', 'DZ']);
// Hedef mezuniyet AKTS'i (varsayım).
const TARGET_ECTS = 240;
// /portal/me ders başına AKTS/kredi taşımadığından standart varsayım kullanılır.
const ECTS_PER_COURSE = 6;
const CREDIT_PER_COURSE = 3;

export default function Slotlar(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Me>('/portal/me')
      .then(setMe)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Bir hata oluştu'));
  }, []);

  const s = me?.student;

  const { slots, passedCount, earnedEcts, earnedCredit } = useMemo(() => {
    const rows = (s?.grades ?? []).map((g) => {
      const done = !!g.letter && !FAIL.has(g.letter);
      return {
        ...g,
        done,
        ects: done ? ECTS_PER_COURSE : 0,
        credit: done ? CREDIT_PER_COURSE : 0,
      };
    });
    const passed = rows.filter((r) => r.done);
    return {
      slots: rows,
      passedCount: passed.length,
      earnedEcts: passed.length * ECTS_PER_COURSE,
      earnedCredit: passed.length * CREDIT_PER_COURSE,
    };
  }, [s]);

  if (err)
    return (
      <>
        <PageHeader title="Mezuniyet İlerlemesi" />
        <Alert tone="err">{err}</Alert>
      </>
    );

  if (!s)
    return (
      <>
        <PageHeader title="Mezuniyet İlerlemesi" sub="İlerlemeniz yükleniyor…" />
        <SkeletonStats n={3} />
        <Skeleton lines={6} />
      </>
    );

  const remainingEcts = Math.max(0, TARGET_ECTS - earnedEcts);
  const pct = (earnedEcts / TARGET_ECTS) * 100;

  return (
    <>
      <PageHeader
        title="Mezuniyet İlerlemesi"
        sub={`${s.studentNo} · ${s.program.name}`}
      />

      <StatGrid
        stats={[
          {
            label: 'Kazanılan AKTS',
            value: earnedEcts,
            icon: 'layers',
            tone: 'ok',
          },
          {
            label: 'Kalan AKTS',
            value: remainingEcts,
            icon: 'target',
            tone: remainingEcts > 0 ? 'warn' : 'ok',
          },
          { label: 'GNO', value: s.gpa.toFixed(2), icon: 'award' },
        ]}
      />

      <Card
        title="Mezuniyet Barajı"
        icon="flag"
        hint={`Hedef ${TARGET_ECTS} AKTS · kazanılan ${earnedEcts} AKTS (${Math.round(
          pct,
        )}%) · tamamlanan kredi ${earnedCredit} · geçilen ders ${passedCount}.`}
      >
        <ProgressBar value={pct} />
        <p className="hint" style={{ marginTop: 8 }}>
          {earnedEcts} / {TARGET_ECTS} AKTS
        </p>
      </Card>

      <Card
        title="Ders Slotları"
        icon="grid"
        hint="Not dökümündeki dersler; geçer harf (FF/FD/DZ hariç) tamamlanmış sayılır. AKTS/kredi standart ders değerleri üzerinden hesaplanır."
      >
        {slots.length === 0 ? (
          <EmptyState
            icon="grade"
            title="Henüz ders kaydı yok"
            sub="Slotlarınız not girişleri yapıldıkça oluşur."
          />
        ) : (
          <DataTable
            rows={slots}
            csv
            csvName="mezuniyet-slotlari"
            columns={[
              {
                key: 'name',
                header: 'Ders',
                value: (r) => `${r.courseCode} ${r.courseName}`,
                render: (r) => (
                  <span>
                    <b>{r.courseCode}</b> · {r.courseName}
                  </span>
                ),
              },
              {
                key: 'letter',
                header: 'Harf',
                value: (r) => r.letter ?? '',
                render: (r) =>
                  r.letter ? (
                    <Badge tone={FAIL.has(r.letter) ? 'danger' : 'ok'}>
                      {r.letter}
                    </Badge>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'ects',
                header: 'AKTS',
                num: true,
                value: (r) => r.ects,
                render: (r) => (r.done ? r.ects : '—'),
              },
              {
                key: 'durum',
                header: 'Durum',
                value: (r) => (r.done ? 'Tamamlandı' : 'Devam ediyor'),
                render: (r) =>
                  r.done ? (
                    <Badge tone="ok">Tamamlandı</Badge>
                  ) : (
                    <Badge tone="info">Devam ediyor</Badge>
                  ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
