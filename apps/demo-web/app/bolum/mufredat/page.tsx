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
  Meter,
  EmptyState,
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
interface CurriculumCourse {
  courseCode: string;
  courseName: string;
  ects: number;
  semesterNo: number;
  isMandatory: boolean;
}
interface MatrixCell {
  outcomeId: string;
  level: number;
}
interface MatrixRow {
  courseCode: string;
  courseName: string;
  cells: MatrixCell[];
}
interface MatrixView {
  outcomes: { id: string; code: string }[];
  rows: MatrixRow[];
}

const TARGET_ECTS = 30; // Bologna: yarıyıl başına hedef AKTS

export default function BolumMufredat(): React.ReactElement {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const [selProgram, setSelProgram] = useState<Program | null>(null);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [verErr, setVerErr] = useState('');
  const [verBusy, setVerBusy] = useState(false);

  const [selVersion, setSelVersion] = useState<VersionSummary | null>(null);
  const [courses, setCourses] = useState<CurriculumCourse[] | null>(null);
  const [matrix, setMatrix] = useState<MatrixView | null>(null);
  const [courseBusy, setCourseBusy] = useState(false);
  const [courseErr, setCourseErr] = useState('');

  useEffect(() => {
    api<Program[]>('/programs')
      .then(setPrograms)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  async function openProgram(p: Program): Promise<void> {
    setSelProgram(p);
    setVersions(null);
    setVerErr('');
    setVerBusy(true);
    setSelVersion(null);
    setCourses(null);
    setMatrix(null);
    try {
      const rows = await api<VersionSummary[]>(`/programs/${p.id}/curriculum-versions`);
      // Aktif önce, sonra yıl azalan.
      rows.sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.year - a.year);
      setVersions(rows);
    } catch (e) {
      setVerErr(e instanceof Error ? e.message : 'Müfredat versiyonları yüklenemedi');
    } finally {
      setVerBusy(false);
    }
  }

  async function openVersion(v: VersionSummary): Promise<void> {
    setSelVersion(v);
    setCourses(null);
    setMatrix(null);
    setCourseErr('');
    setCourseBusy(true);
    try {
      const [cs, mx] = await Promise.all([
        api<CurriculumCourse[]>(`/curriculum-versions/${v.id}/courses`),
        api<MatrixView>(`/curriculum-versions/${v.id}/matrix`).catch(() => null),
      ]);
      setCourses(cs);
      setMatrix(mx);
    } catch (e) {
      setCourseErr(e instanceof Error ? e.message : 'Müfredat yüklenemedi');
    } finally {
      setCourseBusy(false);
    }
  }

  const bySemester = useMemo(() => {
    if (!courses) return [];
    const map = new Map<number, CurriculumCourse[]>();
    for (const c of courses) {
      const arr = map.get(c.semesterNo) ?? [];
      arr.push(c);
      map.set(c.semesterNo, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [courses]);

  const totalEcts = courses?.reduce((a, c) => a + c.ects, 0) ?? 0;
  const offSemesters = useMemo(
    () =>
      bySemester.filter(([, list]) => {
        const s = list.reduce((a, c) => a + c.ects, 0);
        return Math.abs(s - TARGET_ECTS) > 3;
      }).length,
    [bySemester],
  );

  // PÇ-DÇ matris kapsama analizi (Bologna): her PÇ en az bir derste ilişkilendirilmiş mi?
  const matrixCoverage = useMemo(() => {
    if (!matrix || matrix.outcomes.length === 0) return null;
    const covered = new Set<string>();
    let totalRel = 0;
    for (const r of matrix.rows) {
      for (const c of r.cells) {
        if (c.level > 0) {
          covered.add(c.outcomeId);
          totalRel += 1;
        }
      }
    }
    const uncovered = matrix.outcomes.filter((o) => !covered.has(o.id));
    return {
      total: matrix.outcomes.length,
      covered: covered.size,
      uncovered,
      totalRel,
    };
  }, [matrix]);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Müfredat"
        sub="Program → müfredat versiyonu → dersler ve Bologna AKTS/kapsam kontrolü. Program seçin, versiyonu açın; sistem yarıyıl AKTS dengesini ve program çıktısı kapsamını denetler."
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Program', value: programs.length, icon: 'grid' },
            {
              label: 'Seçili programın versiyonu',
              value: versions ? versions.length : '—',
              icon: 'layers',
            },
            {
              label: 'Seçili versiyon toplam AKTS',
              value: selVersion ? totalEcts : '—',
              icon: 'award',
            },
            {
              label: 'AKTS sapan yarıyıl',
              value: selVersion && courses ? offSemesters : '—',
              icon: 'alert',
              tone: selVersion && courses && offSemesters > 0 ? 'warn' : undefined,
            },
          ]}
        />
      )}

      <Card
        title="Bölüm Programları"
        icon="grid"
        hint="Müfredat versiyonlarını görmek için bir program seçin. Versiyon kimliğini el ile girmenize gerek yok."
      >
        {loading ? (
          <Skeleton lines={5} />
        ) : programs.length === 0 ? (
          <EmptyState icon="grid" title="Program bulunamadı" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Kod</th>
                <th>Program</th>
                <th>Düzey</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr
                  key={p.id}
                  style={selProgram?.id === p.id ? { background: 'var(--infobg)' } : undefined}
                >
                  <td>
                    <b>{p.code}</b>
                  </td>
                  <td>{p.name}</td>
                  <td>{p.level}</td>
                  <td>
                    <Button
                      variant={selProgram?.id === p.id ? 'primary' : 'ghost'}
                      sm
                      icon="layers"
                      onClick={() => openProgram(p)}
                    >
                      Versiyonlar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {selProgram && (
        <Card
          title={`Müfredat Versiyonları · ${selProgram.code}`}
          icon="layers"
          hint={`${selProgram.name} — versiyon seçip dersleri ve PÇ kapsamını açın.`}
        >
          {verErr && <Alert tone="err">{verErr}</Alert>}
          {verBusy ? (
            <Skeleton lines={4} />
          ) : versions && versions.length === 0 ? (
            <EmptyState icon="layers" title="Bu programda tanımlı müfredat versiyonu yok" />
          ) : versions ? (
            <table>
              <thead>
                <tr>
                  <th>Yıl</th>
                  <th>Versiyon</th>
                  <th>Durum</th>
                  <th>Ders</th>
                  <th>Toplam AKTS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr
                    key={v.id}
                    style={selVersion?.id === v.id ? { background: 'var(--infobg)' } : undefined}
                  >
                    <td>
                      <b>{v.year}</b>
                    </td>
                    <td>{v.name}</td>
                    <td>
                      <Badge tone={v.isActive ? 'ok' : 'muted'}>
                        {v.isActive ? 'Aktif' : 'Arşiv'}
                      </Badge>
                    </td>
                    <td>{v.courseCount}</td>
                    <td>{v.totalEcts}</td>
                    <td>
                      <Button
                        variant={selVersion?.id === v.id ? 'primary' : 'ghost'}
                        sm
                        icon="arrowRight"
                        onClick={() => openVersion(v)}
                      >
                        Aç
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
      )}

      {selVersion && (
        <>
          {courseErr && <Alert tone="err">{courseErr}</Alert>}
          {courseBusy ? (
            <Card>
              <Skeleton lines={6} />
            </Card>
          ) : courses ? (
            <>
              <Card title="Versiyon Özeti" icon="fileText">
                <StatGrid
                  stats={[
                    { label: 'Ders', value: courses.length, icon: 'book' },
                    { label: 'Toplam AKTS', value: totalEcts, icon: 'award' },
                    { label: 'Yarıyıl', value: bySemester.length, icon: 'calendar' },
                    {
                      label: 'Zorunlu ders',
                      value: courses.filter((c) => c.isMandatory).length,
                      icon: 'shield',
                    },
                  ]}
                />
                {offSemesters > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <Alert tone="warn">
                      {offSemesters} yarıyıl hedef {TARGET_ECTS} AKTS&apos;den ±3&apos;ten fazla
                      sapıyor — Bologna denge kontrolü.
                    </Alert>
                  </div>
                )}
              </Card>

              {matrixCoverage && (
                <Card
                  title="Program Çıktısı (PÇ) Kapsamı"
                  icon="target"
                  hint="PÇ-DÇ ilişki matrisine göre program çıktılarının müfredat dersleriyle kapsanma durumu (Bologna / TYYÇ uyumu)."
                >
                  <StatGrid
                    stats={[
                      { label: 'Program çıktısı', value: matrixCoverage.total, icon: 'target' },
                      { label: 'Kapsanan PÇ', value: matrixCoverage.covered, icon: 'checkCircle' },
                      {
                        label: 'Kapsanmayan PÇ',
                        value: matrixCoverage.uncovered.length,
                        icon: 'alert',
                        tone: matrixCoverage.uncovered.length > 0 ? 'warn' : undefined,
                      },
                      { label: 'Toplam ilişki', value: matrixCoverage.totalRel, icon: 'link' },
                    ]}
                  />
                  <div style={{ marginTop: 10 }}>
                    <Meter
                      value={Math.round((matrixCoverage.covered / matrixCoverage.total) * 100)}
                      label="Kapsama oranı"
                    />
                  </div>
                  {matrixCoverage.uncovered.length === 0 ? (
                    <p style={{ marginTop: 10 }}>
                      <Badge tone="ok">Tüm program çıktıları kapsanıyor</Badge>
                    </p>
                  ) : (
                    <p style={{ marginTop: 10 }}>
                      <Badge tone="warn">Kapsanmayan PÇ</Badge>{' '}
                      {matrixCoverage.uncovered.map((o) => o.code).join(', ')}
                    </p>
                  )}
                </Card>
              )}

              {courses.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="book"
                    title="Bu müfredat versiyonunda ders tanımlı değil"
                  />
                </Card>
              ) : (
                bySemester.map(([sem, list]) => {
                  const sumEcts = list.reduce((a, c) => a + c.ects, 0);
                  const off = sumEcts - TARGET_ECTS;
                  const tone = off === 0 ? 'ok' : Math.abs(off) <= 3 ? 'warn' : 'danger';
                  return (
                    <Card
                      key={sem}
                      title={`${sem}. Yarıyıl`}
                      icon="calendar"
                      actions={
                        <Badge tone={tone}>
                          {sumEcts} AKTS
                          {off !== 0 && ` (${off > 0 ? '+' : ''}${off})`}
                        </Badge>
                      }
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Ders Kodu</th>
                            <th>Ders Adı</th>
                            <th>AKTS</th>
                            <th>Tür</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((c) => (
                            <tr key={c.courseCode}>
                              <td>
                                <b>{c.courseCode}</b>
                              </td>
                              <td>{c.courseName}</td>
                              <td>{c.ects}</td>
                              <td>
                                <Badge tone={c.isMandatory ? 'muted' : 'ok'}>
                                  {c.isMandatory ? 'Zorunlu' : 'Seçmeli'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  );
                })
              )}
            </>
          ) : null}
        </>
      )}
    </>
  );
}
