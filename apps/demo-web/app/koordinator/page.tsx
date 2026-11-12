'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  EmptyState,
  Skeleton,
  SkeletonStats,
  Alert,
  Drawer,
  BarChart,
} from '@/app/ui';

interface Program {
  id: string;
  code: string;
  name: string;
  level: string;
}
interface VersionSummary {
  id: string;
  versionId: string;
  year: number;
  name: string;
  isActive: boolean;
  courseCount: number;
  totalEcts: number;
}
interface Course {
  courseCode: string;
  courseName: string;
  ects: number;
  semesterNo: number;
  isMandatory: boolean;
}

const LEVEL_TR: Record<string, string> = {
  onlisans: 'Ön Lisans',
  lisans: 'Lisans',
  yukseklisans: 'Yüksek Lisans',
  yuksek_lisans: 'Yüksek Lisans',
  doktora: 'Doktora',
};

export default function ProgramKatalogu(): React.ReactElement {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Seçilen program — müfredat versiyonları (drawer).
  const [selProg, setSelProg] = useState<Program | null>(null);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [vErr, setVErr] = useState('');
  const [vBusy, setVBusy] = useState(false);

  // Seçilen versiyonun dersleri (drawer 2).
  const [selVersion, setSelVersion] = useState<{ v: VersionSummary; prog: Program } | null>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [cErr, setCErr] = useState('');
  const [cBusy, setCBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    api<Program[]>('/programs')
      .then(setPrograms)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openProgram = useCallback(async (p: Program) => {
    setSelProg(p);
    setVersions(null);
    setVErr('');
    setVBusy(true);
    try {
      const rows = await api<VersionSummary[]>(`/programs/${p.id}/curriculum-versions`);
      setVersions(rows);
    } catch (e) {
      setVErr(e instanceof Error ? e.message : 'Versiyonlar okunamadı');
    } finally {
      setVBusy(false);
    }
  }, []);

  const openVersion = useCallback(async (v: VersionSummary, prog: Program) => {
    setSelVersion({ v, prog });
    setCourses(null);
    setCErr('');
    setCBusy(true);
    try {
      const rows = await api<Course[]>(`/curriculum-versions/${v.id}/courses`);
      setCourses(rows);
    } catch (e) {
      setCErr(e instanceof Error ? e.message : 'Dersler okunamadı');
    } finally {
      setCBusy(false);
    }
  }, []);

  const stats = useMemo(() => {
    const lisans = programs.filter((p) => p.level === 'lisans').length;
    const onlisans = programs.filter((p) => p.level === 'onlisans').length;
    const ustu = programs.filter(
      (p) => p.level === 'yukseklisans' || p.level === 'yuksek_lisans' || p.level === 'doktora',
    ).length;
    return { lisans, onlisans, ustu };
  }, [programs]);

  const levelDist = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of programs) {
      const key = LEVEL_TR[p.level] ?? p.level;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return [...m.entries()].map(([label, value]) => ({ label, value }));
  }, [programs]);

  const drawerTotals = useMemo(() => {
    if (!courses) return null;
    const totalEcts = courses.reduce((a, c) => a + c.ects, 0);
    const mandatory = courses.filter((c) => c.isMandatory).length;
    const semesters = new Set(courses.map((c) => c.semesterNo)).size;
    return { totalEcts, mandatory, semesters };
  }, [courses]);

  return (
    <>
      <PageHeader
        title="Program Kataloğu"
        sub="Kurumdaki tüm akademik programlar, müfredat versiyonları ve ders/AKTS dağılımı. Bir programa tıklayarak müfredat versiyonlarını, bir versiyona tıklayarak ders listesini görüntüleyin."
        actions={<Button variant="ghost" icon="refresh" sm onClick={load}>Yenile</Button>}
      />
      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam Program', value: programs.length, icon: 'layers' },
            { label: 'Lisans Programı', value: stats.lisans, icon: 'award' },
            { label: 'Ön Lisans', value: stats.onlisans, icon: 'book' },
            { label: 'Lisansüstü', value: stats.ustu, icon: 'grade' },
          ]}
        />
      )}

      {!loading && levelDist.length > 0 && (
        <Card title="Düzey Dağılımı" icon="pie">
          <BarChart data={levelDist} />
        </Card>
      )}

      <Card title="Programlar" icon="grid" hint="Detay ve müfredat versiyonları için bir satıra tıklayın.">
        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable
            rows={programs}
            search
            csv
            csvName="program-katalogu"
            pageSize={25}
            empty={<EmptyState icon="layers" title="Program bulunamadı" sub="Kurum için tanımlı akademik program yok." />}
            columns={[
              {
                key: 'code',
                header: 'Kod',
                value: (p) => p.code,
                sortable: true,
                render: (p) => <b>{p.code}</b>,
              },
              { key: 'name', header: 'Program', value: (p) => p.name, sortable: true },
              {
                key: 'level',
                header: 'Düzey',
                value: (p) => LEVEL_TR[p.level] ?? p.level,
                sortable: true,
                render: (p) => <Badge tone="muted">{LEVEL_TR[p.level] ?? p.level}</Badge>,
              },
              {
                key: 'act',
                header: '',
                render: (p) => (
                  <Button variant="ghost" sm icon="arrowRight" onClick={() => openProgram(p)}>
                    Müfredat
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Program müfredat versiyonları drawer */}
      <Drawer
        open={!!selProg}
        onClose={() => setSelProg(null)}
        title={selProg ? `${selProg.code} · Müfredat Versiyonları` : ''}
      >
        {selProg && (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              {selProg.name} · {LEVEL_TR[selProg.level] ?? selProg.level}
            </p>
            {vErr && <Alert tone="err">{vErr}</Alert>}
            {vBusy ? (
              <Skeleton lines={4} />
            ) : versions && versions.length === 0 ? (
              <EmptyState icon="calendar" title="Müfredat versiyonu yok" sub="Bu program için tanımlı müfredat versiyonu bulunmuyor." />
            ) : versions ? (
              <table style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Katalog</th>
                    <th>Versiyon</th>
                    <th>Durum</th>
                    <th>Ders</th>
                    <th>AKTS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <b>{v.year}</b>
                      </td>
                      <td>{v.name}</td>
                      <td>
                        <Badge tone={v.isActive ? 'ok' : 'muted'}>{v.isActive ? 'Aktif' : 'Pasif'}</Badge>
                      </td>
                      <td>{v.courseCount}</td>
                      <td>{v.totalEcts}</td>
                      <td>
                        <Button variant="ghost" sm onClick={() => openVersion(v, selProg)}>
                          Dersler
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </>
        )}
      </Drawer>

      {/* Versiyon dersleri drawer */}
      <Drawer
        open={!!selVersion}
        onClose={() => setSelVersion(null)}
        title={selVersion ? `${selVersion.prog.code} · ${selVersion.v.name}` : ''}
      >
        {selVersion && (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              {selVersion.prog.name} · Katalog {selVersion.v.year} ·{' '}
              {selVersion.v.isActive ? 'Aktif' : 'Pasif'}
            </p>
            {cErr && <Alert tone="err">{cErr}</Alert>}
            {cBusy ? (
              <Skeleton lines={5} />
            ) : courses && drawerTotals ? (
              <>
                <StatGrid
                  stats={[
                    { label: 'Ders', value: courses.length, icon: 'book' },
                    { label: 'Toplam AKTS', value: drawerTotals.totalEcts, icon: 'grade' },
                    { label: 'Zorunlu', value: drawerTotals.mandatory, icon: 'check' },
                    { label: 'Yarıyıl', value: drawerTotals.semesters, icon: 'calendar' },
                  ]}
                />
                {courses.length === 0 ? (
                  <EmptyState icon="book" title="Ders tanımı yok" sub="Bu versiyonda ders bulunamadı." />
                ) : (
                  <table style={{ marginTop: 12 }}>
                    <thead>
                      <tr>
                        <th>Yy</th>
                        <th>Kod</th>
                        <th>Ders</th>
                        <th>AKTS</th>
                        <th>Tür</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...courses]
                        .sort(
                          (a, b) =>
                            a.semesterNo - b.semesterNo || a.courseCode.localeCompare(b.courseCode),
                        )
                        .map((c, i) => (
                          <tr key={`${c.courseCode}-${i}`}>
                            <td>{c.semesterNo}</td>
                            <td>
                              <b>{c.courseCode}</b>
                            </td>
                            <td>{c.courseName}</td>
                            <td>{c.ects}</td>
                            <td>
                              <Badge tone={c.isMandatory ? 'ok' : 'muted'}>
                                {c.isMandatory ? 'Zorunlu' : 'Seçmeli'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : null}
          </>
        )}
      </Drawer>
    </>
  );
}
