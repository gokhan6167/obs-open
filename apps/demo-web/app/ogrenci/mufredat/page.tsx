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

interface Me {
  student?: {
    studentNo: string;
    program: { name: string };
    curriculumVersionId?: string | null;
  };
}
interface CurriculumCourse {
  courseCode: string;
  courseName: string;
  ects: number;
  semesterNo: number;
  isMandatory: boolean;
}
interface Sched {
  courseCode: string;
  courseName: string;
  ects: number;
  localCredit: number;
  termName: string;
}

// Ortak satır modeli: müfredat veya program tabanlı.
interface Row {
  courseCode: string;
  courseName: string;
  ects: number;
  localCredit: number | null;
  group: string; // "N. Yarıyıl" ya da dönem adı
  order: number; // gruplama sırası
  isMandatory: boolean | null;
}

export default function Mufredat(): React.ReactElement {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<'curriculum' | 'schedule'>('curriculum');
  const [sub, setSub] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const me = await api<Me>('/portal/me');
        const st = me.student;
        if (!st) {
          setErr('Öğrenci kaydı bulunamadı.');
          return;
        }
        const label = `${st.studentNo} · ${st.program.name}`;

        if (st.curriculumVersionId) {
          const cs = await api<CurriculumCourse[]>(
            `/curriculum-versions/${st.curriculumVersionId}/courses`,
          );
          setSource('curriculum');
          setSub(`${label} — müfredat programınız (yarıyıl bazlı).`);
          setRows(
            cs.map((c) => ({
              courseCode: c.courseCode,
              courseName: c.courseName,
              ects: c.ects,
              localCredit: null,
              group: `${c.semesterNo}. Yarıyıl`,
              order: c.semesterNo,
              isMandatory: c.isMandatory,
            })),
          );
          return;
        }

        // Müfredat versiyonu tanımlı değil -> program (ders programı) tabanlı görünüm.
        const sched = await api<Sched[]>('/portal/schedule');
        setSource('schedule');
        setSub(`${label} — kayıtlı olduğunuz program dersleri (dönem bazlı).`);
        // Aynı ders birden fazla dönemde olabilir; ders bazında tekilleştir.
        const seen = new Set<string>();
        const uniq: Sched[] = [];
        for (const s of sched) {
          if (seen.has(s.courseCode)) continue;
          seen.add(s.courseCode);
          uniq.push(s);
        }
        const termOrder = new Map<string, number>();
        for (const s of sched) if (!termOrder.has(s.termName)) termOrder.set(s.termName, termOrder.size);
        setRows(
          uniq.map((s) => ({
            courseCode: s.courseCode,
            courseName: s.courseName,
            ects: s.ects,
            localCredit: s.localCredit,
            group: s.termName,
            order: termOrder.get(s.termName) ?? 0,
            isMandatory: null,
          })),
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Hata');
      }
    })();
  }, []);

  if (err)
    return (
      <>
        <PageHeader title="Program Dersleri (Müfredat)" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  if (!rows)
    return (
      <>
        <PageHeader title="Program Dersleri (Müfredat)" sub="Müfredatınız yükleniyor…" />
        <SkeletonStats n={3} />
        <Skeleton lines={6} />
      </>
    );

  const totalEcts = rows.reduce((a, r) => a + (r.ects ?? 0), 0);
  const mandatory = rows.filter((r) => r.isMandatory === true).length;

  // Gruplara ayır (order'a göre sıralı).
  const groups = new Map<string, { order: number; list: Row[] }>();
  for (const r of rows) {
    const g = groups.get(r.group) ?? { order: r.order, list: [] };
    g.list.push(r);
    groups.set(r.group, g);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[1].order - b[1].order);

  return (
    <>
      <PageHeader title="Program Dersleri (Müfredat)" sub={sub} />

      {source === 'schedule' && (
        <Alert tone="info">
          Müfredat versiyonunuz tanımlı olmadığından, kayıtlı olduğunuz program dersleri dönem bazlı
          gösteriliyor.
        </Alert>
      )}

      <StatGrid
        stats={[
          { label: 'Ders', value: rows.length, icon: 'book' },
          { label: 'Toplam AKTS', value: totalEcts, icon: 'layers' },
          {
            label: source === 'curriculum' ? 'Zorunlu ders' : 'Grup',
            value: source === 'curriculum' ? mandatory : sortedGroups.length,
            icon: source === 'curriculum' ? 'shield' : 'calendar',
          },
        ]}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon="layers" title="Tanımlı müfredat dersi bulunamadı" />
        </Card>
      ) : (
        sortedGroups.map(([group, { list }]) => {
          const sumEcts = list.reduce((a, r) => a + r.ects, 0);
          return (
            <Card
              key={group}
              title={group}
              icon="calendar"
              actions={<Badge tone="muted">{sumEcts} AKTS</Badge>}
            >
              <DataTable
                rows={list}
                search
                csv
                csvName={`mufredat-${group.replace(/\s+/g, '-').toLowerCase()}`}
                columns={[
                  {
                    key: 'code',
                    header: 'Ders Kodu',
                    value: (r) => r.courseCode,
                    render: (r) => <b>{r.courseCode}</b>,
                  },
                  { key: 'name', header: 'Ders Adı', value: (r) => r.courseName },
                  ...(source === 'schedule'
                    ? [
                        {
                          key: 'credit',
                          header: 'Kredi',
                          num: true,
                          value: (r: Row) => r.localCredit ?? -1,
                          render: (r: Row) => r.localCredit ?? '—',
                        },
                      ]
                    : []),
                  { key: 'ects', header: 'AKTS', num: true, value: (r) => r.ects },
                  {
                    key: 'type',
                    header: 'Tür',
                    value: (r) =>
                      r.isMandatory === null ? '' : r.isMandatory ? 'Zorunlu' : 'Seçmeli',
                    render: (r) =>
                      r.isMandatory === null ? (
                        '—'
                      ) : (
                        <Badge tone={r.isMandatory ? 'muted' : 'ok'}>
                          {r.isMandatory ? 'Zorunlu' : 'Seçmeli'}
                        </Badge>
                      ),
                  },
                ]}
              />
            </Card>
          );
        })
      )}
    </>
  );
}
