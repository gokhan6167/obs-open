'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Button,
  Skeleton,
  SkeletonStats,
  Alert,
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
interface SemesterCourse {
  courseCode: string;
  courseName: string;
  ects: number;
  localCredit: number;
  isMandatory: boolean;
}
interface Outcome {
  id: string;
  code: string;
  textTr: string;
  textEn: string | null;
  tyycDimension: string | null;
}
interface CourseOutcomeGroup {
  courseCode: string;
  courseName: string;
  outcomes: { id: string; code: string; textTr: string; textEn: string | null }[];
}
interface AccreditationReport {
  program: {
    code: string;
    name: string;
    level: string;
    language: string;
    versionName: string;
    catalogYear: number;
    totalEcts: number;
    courseCount: number;
  };
  tyyc: { level: number; label: string };
  semesters: { semesterNo: number; ects: number; courses: SemesterCourse[] }[];
  outcomes: Outcome[];
  courseOutcomes: CourseOutcomeGroup[];
  matrix: {
    outcomes: { id: string; code: string }[];
    rows: { courseCode: string; courseName: string; cells: { outcomeId: string; level: number }[] }[];
  };
  coverage: {
    totalOutcomes: number;
    coveredOutcomes: number;
    uncovered: string[];
    coverageRatio: number;
  };
}

const LEVEL_TR: Record<string, string> = {
  onlisans: 'Ön Lisans',
  lisans: 'Lisans',
  yukseklisans: 'Yüksek Lisans',
  yuksek_lisans: 'Yüksek Lisans',
  doktora: 'Doktora',
};

export default function Akreditasyon(): React.ReactElement {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState('');
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionId, setVersionId] = useState('');
  const [err, setErr] = useState('');
  const [vErr, setVErr] = useState('');

  const [report, setReport] = useState<AccreditationReport | null>(null);
  const [rErr, setRErr] = useState('');
  const [busy, setBusy] = useState(false);

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

  const load = useCallback(async (pId: string, vId: string) => {
    setBusy(true);
    setRErr('');
    setReport(null);
    try {
      const r = await api<AccreditationReport>(
        `/reports/accreditation?programId=${pId}&versionId=${vId}`,
      );
      setReport(r);
    } catch (e) {
      setRErr(e instanceof Error ? e.message : 'Döküm oluşturulamadı');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (programId && versionId) void load(programId, versionId);
  }, [programId, versionId, load]);

  const dcByCode = useMemo(() => {
    const m = new Map<string, CourseOutcomeGroup['outcomes']>();
    for (const co of report?.courseOutcomes ?? []) m.set(co.courseCode, co.outcomes);
    return m;
  }, [report]);

  const mandatoryEcts = useMemo(
    () =>
      report?.semesters
        .flatMap((s) => s.courses)
        .filter((c) => c.isMandatory)
        .reduce((a, c) => a + c.ects, 0) ?? 0,
    [report],
  );

  const coveragePct = report ? Math.round(report.coverage.coverageRatio * 100) : 0;

  return (
    <>
      <PageHeader
        title="Akreditasyon Dökümü"
        sub="Program müfredatını akreditasyon formatında (künye, TYYÇ, AKTS dağılımı, PÇ, ders öğrenme çıktıları, PÇ-DÇ matris kapsaması) tek dökümde derleyip yazdırılabilir çıktı olarak dışa aktarın. Tüm veriler canlı müfredat ucundan gelir."
        actions={
          report ? (
            <Button variant="ok" icon="download" onClick={() => window.print()}>
              Yazdır / PDF
            </Button>
          ) : undefined
        }
      />
      {err && <Alert tone="err">{err}</Alert>}

      <Card title="Döküm Parametreleri" icon="filter">
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

      {busy && (
        <>
          <SkeletonStats n={6} />
          <Skeleton lines={8} />
        </>
      )}

      {report && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Akreditasyon Dökümü — {report.program.name}</h2>
            <Button variant="ok" sm icon="download" onClick={() => window.print()}>
              Yazdır / PDF
            </Button>
          </div>
          <p className="hint">
            {report.program.code} · {LEVEL_TR[report.program.level] ?? report.program.level} ·{' '}
            {report.program.versionName} (Katalog {report.program.catalogYear}) ·{' '}
            {report.program.language?.toUpperCase()} · {report.tyyc.label}
          </p>

          <StatGrid
            stats={[
              { label: 'Toplam Ders', value: report.program.courseCount, icon: 'book' },
              { label: 'Toplam AKTS', value: report.program.totalEcts, icon: 'grade' },
              { label: 'Zorunlu AKTS', value: mandatoryEcts, icon: 'check' },
              { label: 'Seçmeli AKTS', value: report.program.totalEcts - mandatoryEcts, icon: 'layers' },
              {
                label: 'Kapsanan PÇ',
                value: `${report.coverage.coveredOutcomes}/${report.coverage.totalOutcomes}`,
                icon: 'checkCircle',
              },
              {
                label: 'PÇ Kapsama Oranı',
                value: `%${coveragePct}`,
                icon: 'pie',
                tone: coveragePct >= 100 ? 'ok' : coveragePct >= 60 ? 'warn' : 'danger',
              },
            ]}
          />

          <div style={{ margin: '12px 0' }}>
            <Meter
              value={coveragePct}
              label={`PÇ kapsama oranı: %${coveragePct} (${report.coverage.coveredOutcomes}/${report.coverage.totalOutcomes} çıktı kapsandı)`}
            />
          </div>

          {report.coverage.uncovered.length > 0 && (
            <Alert tone="warn">
              Kapsam uyarısı: {report.coverage.uncovered.length} program çıktısı hiçbir derse
              bağlanmamış ({report.coverage.uncovered.join(', ')}). Akreditasyon başvurusu öncesi
              matris tamamlanmalıdır.
            </Alert>
          )}

          {/* Program çıktıları */}
          <h2 style={{ fontSize: 15, marginTop: 16 }}>Program Çıktıları (PÇ)</h2>
          {report.outcomes.length === 0 ? (
            <p className="muted">Program çıktısı tanımlanmamış.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Çıktı</th>
                  <th>TYYÇ Boyutu</th>
                </tr>
              </thead>
              <tbody>
                {report.outcomes.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <b>{o.code}</b>
                    </td>
                    <td>
                      {o.textTr}
                      {o.textEn && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          EN: {o.textEn}
                        </div>
                      )}
                    </td>
                    <td>
                      {o.tyycDimension ? (
                        <Badge tone="info">{o.tyycDimension}</Badge>
                      ) : (
                        <Badge tone="warn">—</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Yarıyıl bazında ders + DÇ */}
          <h2 style={{ fontSize: 15, marginTop: 16 }}>Ders Planı ve Öğrenme Çıktıları</h2>
          {report.semesters.map((s) => (
            <div key={s.semesterNo} style={{ marginTop: 12 }}>
              <h2 style={{ fontSize: 14 }}>
                {s.semesterNo}. Yarıyıl{' '}
                <span className="muted" style={{ fontSize: 12 }}>
                  ({s.ects} AKTS)
                </span>
              </h2>
              <table>
                <thead>
                  <tr>
                    <th>Kod</th>
                    <th>Ders Adı</th>
                    <th>AKTS</th>
                    <th>Kredi</th>
                    <th>Tür</th>
                    <th>DÇ</th>
                  </tr>
                </thead>
                <tbody>
                  {s.courses.map((c, i) => {
                    const dc = dcByCode.get(c.courseCode) ?? [];
                    return (
                      <tr key={`${c.courseCode}-${i}`}>
                        <td>
                          <b>{c.courseCode}</b>
                        </td>
                        <td>
                          {c.courseName}
                          {dc.length > 0 && (
                            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                              {dc.map((d) => `${d.code}: ${d.textTr}`).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td>{c.ects}</td>
                        <td>{c.localCredit}</td>
                        <td>
                          <Badge tone={c.isMandatory ? 'ok' : 'muted'}>
                            {c.isMandatory ? 'Zorunlu' : 'Seçmeli'}
                          </Badge>
                        </td>
                        <td>
                          <Badge tone={dc.length > 0 ? 'ok' : 'warn'}>{dc.length}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {/* PÇ-DÇ matris özeti */}
          {report.matrix.outcomes.length > 0 && report.matrix.rows.length > 0 && (
            <>
              <h2 style={{ fontSize: 15, marginTop: 16 }}>PÇ-DÇ İlişki Matrisi</h2>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Ders</th>
                      {report.matrix.outcomes.map((o) => (
                        <th key={o.id} style={{ textAlign: 'center' }}>
                          {o.code}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.matrix.rows.map((r) => (
                      <tr key={r.courseCode}>
                        <td>
                          <b>{r.courseCode}</b>
                        </td>
                        {r.cells.map((c) => (
                          <td
                            key={c.outcomeId}
                            style={{
                              textAlign: 'center',
                              background: ['transparent', '#e8f0fe', '#b9d4fb', '#6ba4f5'][c.level],
                              fontWeight: c.level >= 2 ? 600 : 400,
                              color: c.level >= 3 ? '#fff' : 'inherit',
                            }}
                          >
                            {c.level > 0 ? c.level : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
            Bu döküm Demo OBS canlı müfredat verisinden üretilmiştir. İlişki düzeyleri: 1 = Düşük, 2
            = Orta, 3 = Yüksek. PÇ kapsama oranı %{coveragePct}.
          </p>
        </div>
      )}
    </>
  );
}
