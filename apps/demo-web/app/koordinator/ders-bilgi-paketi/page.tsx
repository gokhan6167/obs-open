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
  Meter,
} from '@/app/ui';

interface Program {
  id: string;
  code: string;
  name: string;
  level: string;
}
interface VersionSummary {
  id: string;
  year: number;
  name: string;
  isActive: boolean;
  courseCount: number;
  totalEcts: number;
}
interface CourseOutcome {
  id: string;
  code: string;
  textTr: string;
  textEn: string | null;
}
interface SemesterCourse {
  courseCode: string;
  courseName: string;
  ects: number;
  localCredit: number;
  isMandatory: boolean;
}
interface AccreditationReport {
  program: { code: string; name: string; level: string; totalEcts: number; courseCount: number };
  semesters: { semesterNo: number; ects: number; courses: SemesterCourse[] }[];
  courseOutcomes: { courseCode: string; courseName: string; outcomes: CourseOutcome[] }[];
}

type CourseWithSemester = SemesterCourse & { semesterNo: number };

/** Bologna standardı: 1 AKTS ≈ 25–30 saat toplam öğrenci iş yükü. */
const HOURS_PER_ECTS = 27;

export default function DersBilgiPaketi(): React.ReactElement {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState('');
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionId, setVersionId] = useState('');
  const [err, setErr] = useState('');
  const [vErr, setVErr] = useState('');

  const [report, setReport] = useState<AccreditationReport | null>(null);
  const [rErr, setRErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [sel, setSel] = useState<CourseWithSemester | null>(null);

  useEffect(() => {
    api<Program[]>('/programs')
      .then((p) => {
        setPrograms(p);
        if (p[0]) setProgramId(p[0].id);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  useEffect(() => {
    if (!programId) return;
    setVersions([]);
    setVersionId('');
    setReport(null);
    setVErr('');
    api<VersionSummary[]>(`/programs/${programId}/curriculum-versions`)
      .then((vs) => {
        setVersions(vs);
        const active = vs.find((v) => v.isActive) ?? vs[0];
        if (active) setVersionId(active.id);
      })
      .catch((e) => setVErr(e instanceof Error ? e.message : 'Versiyonlar okunamadı'));
  }, [programId]);

  const loadReport = useCallback(async (pId: string, vId: string) => {
    setBusy(true);
    setRErr('');
    setReport(null);
    setSel(null);
    try {
      const r = await api<AccreditationReport>(
        `/reports/accreditation?programId=${pId}&versionId=${vId}`,
      );
      setReport(r);
    } catch (e) {
      setRErr(e instanceof Error ? e.message : 'Ders bilgi paketi okunamadı');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (programId && versionId) void loadReport(programId, versionId);
  }, [programId, versionId, loadReport]);

  const allCourses = useMemo<CourseWithSemester[]>(
    () =>
      report?.semesters.flatMap((s) => s.courses.map((c) => ({ ...c, semesterNo: s.semesterNo }))) ??
      [],
    [report],
  );
  const dcByCode = useMemo(() => {
    const m = new Map<string, CourseOutcome[]>();
    for (const co of report?.courseOutcomes ?? []) m.set(co.courseCode, co.outcomes);
    return m;
  }, [report]);

  const withDc = useMemo(
    () => allCourses.filter((c) => (dcByCode.get(c.courseCode)?.length ?? 0) > 0).length,
    [allCourses, dcByCode],
  );
  const dcPct = allCourses.length > 0 ? Math.round((withDc / allCourses.length) * 100) : 0;

  const selDc = sel ? dcByCode.get(sel.courseCode) ?? [] : [];

  return (
    <>
      <PageHeader
        title="Ders Bilgi Paketi"
        sub={`Ders bazında AKTS iş yükü ve öğrenme çıktıları (DÇ, TR/EN). İş yükü, kayıtlı AKTS değerinden Bologna standardına (1 AKTS ≈ ${HOURS_PER_ECTS} saat) göre türetilir; öğrenme çıktıları canlı müfredat verisinden gelir.`}
      />
      {err && <Alert tone="err">{err}</Alert>}

      <Card title="Program ve Müfredat Seç" icon="filter">
        <div className="row" style={{ gap: 8 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Program</label>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Müfredat Versiyonu</label>
            <select
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              disabled={versions.length === 0}
            >
              {versions.length === 0 && <option value="">— versiyon yok —</option>}
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.year} · {v.name}
                  {v.isActive ? ' (aktif)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        {vErr && <Alert tone="err">{vErr}</Alert>}
        {rErr && <Alert tone="err">{rErr}</Alert>}
      </Card>

      {busy && <SkeletonStats n={4} />}

      {report && (
        <>
          <StatGrid
            stats={[
              { label: 'Ders', value: allCourses.length, icon: 'book' },
              { label: 'Toplam AKTS', value: report.program.totalEcts, icon: 'grade' },
              {
                label: 'Toplam İş Yükü (saat)',
                value: report.program.totalEcts * HOURS_PER_ECTS,
                icon: 'clock',
              },
              {
                label: 'DÇ Girilmiş Ders',
                value: `${withDc}/${allCourses.length}`,
                icon: 'checkCircle',
                tone: dcPct >= 80 ? 'ok' : dcPct >= 40 ? 'warn' : 'danger',
              },
            ]}
          />

          <Card
            title="Öğrenme Çıktısı Kapsaması"
            icon="target"
            hint="Öğrenme çıktısı (DÇ) girilmiş derslerin toplam derslere oranı. Akreditasyon için tüm dersler kapsanmalıdır."
          >
            <Meter value={dcPct} label={`%${dcPct} ders DÇ girilmiş (${withDc}/${allCourses.length})`} />
          </Card>

          <Card title="AKTS İş Yükü ve Öğrenme Çıktıları" icon="book" hint="Bilgi paketi için bir satıra tıklayın.">
            {allCourses.length === 0 ? (
              <EmptyState icon="book" title="Ders bulunmuyor" sub="Bu müfredat versiyonunda ders tanımı yok." />
            ) : (
              <DataTable
                rows={allCourses}
                search
                csv
                csvName="ders-bilgi-paketi"
                pageSize={30}
                empty={<EmptyState icon="search" title="Sonuç yok" sub="Aramaya uyan ders bulunamadı." />}
                columns={[
                  {
                    key: 'sem',
                    header: 'Yy',
                    num: true,
                    sortable: true,
                    value: (c) => c.semesterNo,
                  },
                  {
                    key: 'code',
                    header: 'Kod',
                    sortable: true,
                    value: (c) => c.courseCode,
                    render: (c) => <b>{c.courseCode}</b>,
                  },
                  { key: 'name', header: 'Ders Adı', sortable: true, value: (c) => c.courseName },
                  { key: 'ects', header: 'AKTS', num: true, sortable: true, value: (c) => c.ects },
                  {
                    key: 'load',
                    header: 'İş Yükü (s)',
                    num: true,
                    sortable: true,
                    value: (c) => c.ects * HOURS_PER_ECTS,
                  },
                  {
                    key: 'dc',
                    header: 'DÇ',
                    num: true,
                    sortable: true,
                    value: (c) => dcByCode.get(c.courseCode)?.length ?? 0,
                    render: (c) => {
                      const n = dcByCode.get(c.courseCode)?.length ?? 0;
                      return <Badge tone={n > 0 ? 'ok' : 'warn'}>{n}</Badge>;
                    },
                  },
                  {
                    key: 'type',
                    header: 'Tür',
                    sortable: true,
                    value: (c) => (c.isMandatory ? 'Zorunlu' : 'Seçmeli'),
                    render: (c) => (
                      <Badge tone={c.isMandatory ? 'ok' : 'muted'}>
                        {c.isMandatory ? 'Zorunlu' : 'Seçmeli'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'act',
                    header: '',
                    render: (c) => (
                      <Button variant="ghost" sm icon="arrowRight" onClick={() => setSel(c)}>
                        Paket
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}

      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel ? `${sel.courseCode} · ${sel.courseName}` : ''}
      >
        {sel && (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              {sel.semesterNo}. Yarıyıl · {sel.ects} AKTS · Yerel Kredi {sel.localCredit} ·{' '}
              {sel.isMandatory ? 'Zorunlu' : 'Seçmeli'}
            </p>

            <StatGrid
              stats={[
                { label: 'AKTS', value: sel.ects, icon: 'grade' },
                { label: 'Toplam İş Yükü (s)', value: sel.ects * HOURS_PER_ECTS, icon: 'clock' },
                {
                  label: 'Haftalık (14 hafta)',
                  value: Math.round((sel.ects * HOURS_PER_ECTS) / 14),
                  icon: 'calendar',
                },
              ]}
            />

            <h2 style={{ fontSize: 15, marginTop: 16 }}>Öğrenme Çıktıları (DÇ)</h2>
            {selDc.length === 0 ? (
              <Alert tone="warn">
                Bu ders için henüz öğrenme çıktısı (DÇ) tanımlanmamış. Akreditasyon dosyası için dersin
                öğrenme çıktıları girilmelidir.
              </Alert>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {selDc.map((d) => (
                  <li key={d.id} className="list-item">
                    <div>
                      <b>{d.code}</b> — {d.textTr}
                    </div>
                    {d.textEn && <div className="meta">EN: {d.textEn}</div>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
