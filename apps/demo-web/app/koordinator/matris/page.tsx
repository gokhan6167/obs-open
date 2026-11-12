'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  EmptyState,
  Skeleton,
  SkeletonStats,
  Alert,
  Meter,
  toast,
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
interface MatrixCell {
  outcomeId: string;
  level: number;
}
interface MatrixRow {
  courseCode: string;
  courseName: string;
  cells: MatrixCell[];
}
interface Matrix {
  outcomes: { id: string; code: string }[];
  rows: MatrixRow[];
}

const LEVELS = [0, 1, 2, 3];
const LEVEL_LABEL = ['—', 'Düşük', 'Orta', 'Yüksek'];

/** İlişki düzeyi rengi (0=yok, 1=düşük, 2=orta, 3=yüksek). */
function cellBg(v: number): string {
  return ['transparent', '#e8f0fe', '#b9d4fb', '#6ba4f5'][v] ?? 'transparent';
}

export default function Matris(): React.ReactElement {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState('');
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionId, setVersionId] = useState('');
  const [err, setErr] = useState('');
  const [vErr, setVErr] = useState('');

  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [mErr, setMErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState('');

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
    setMatrix(null);
    setVErr('');
    api<VersionSummary[]>(`/programs/${programId}/curriculum-versions`)
      .then((vs) => {
        setVersions(vs);
        const active = vs.find((v) => v.isActive) ?? vs[0];
        if (active) setVersionId(active.id);
      })
      .catch((e) => setVErr(e instanceof Error ? e.message : 'Versiyonlar okunamadı'));
  }, [programId]);

  const loadMatrix = useCallback(async (vId: string) => {
    setBusy(true);
    setMErr('');
    setMatrix(null);
    try {
      const m = await api<Matrix>(`/curriculum-versions/${vId}/matrix`);
      setMatrix(m);
    } catch (e) {
      setMErr(e instanceof Error ? e.message : 'Matris okunamadı');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (versionId) void loadMatrix(versionId);
  }, [versionId, loadMatrix]);

  const setCell = useCallback(
    async (row: MatrixRow, outcomeId: string, level: number) => {
      if (!versionId) return;
      const key = `${row.courseCode}:${outcomeId}`;
      setSaving(key);
      setMErr('');
      try {
        await api(`/curriculum-versions/${versionId}/matrix/cells`, {
          method: 'POST',
          body: { courseCode: row.courseCode, outcomeId, level },
        });
        // Optimistik güncelleme.
        setMatrix((m) =>
          m
            ? {
                ...m,
                rows: m.rows.map((r) =>
                  r.courseCode === row.courseCode
                    ? {
                        ...r,
                        cells: r.cells.map((c) =>
                          c.outcomeId === outcomeId ? { ...c, level } : c,
                        ),
                      }
                    : r,
                ),
              }
            : m,
        );
        toast('İlişki düzeyi kaydedildi', { tone: 'ok' });
      } catch (e) {
        setMErr(e instanceof Error ? e.message : 'Hücre kaydedilemedi');
      } finally {
        setSaving('');
      }
    },
    [versionId],
  );

  const stats = useMemo(() => {
    if (!matrix) return null;
    const covered = new Set<string>();
    let relations = 0;
    for (const r of matrix.rows) {
      for (const c of r.cells) {
        if (c.level > 0) {
          covered.add(c.outcomeId);
          relations += 1;
        }
      }
    }
    const uncoveredCourses = matrix.rows.filter((r) => r.cells.every((c) => c.level === 0)).length;
    const cellCount = matrix.rows.length * matrix.outcomes.length;
    return {
      courses: matrix.rows.length,
      outcomes: matrix.outcomes.length,
      covered: covered.size,
      uncovered: matrix.outcomes.length - covered.size,
      uncoveredOutcomeIds: matrix.outcomes.filter((o) => !covered.has(o.id)).map((o) => o.code),
      relations,
      uncoveredCourses,
      coveragePct: matrix.outcomes.length > 0 ? Math.round((covered.size / matrix.outcomes.length) * 100) : 0,
      densityPct: cellCount > 0 ? Math.round((relations / cellCount) * 100) : 0,
    };
  }, [matrix]);

  const selProgram = programs.find((p) => p.id === programId);

  return (
    <>
      <PageHeader
        title="TYYÇ / PÇ-DÇ Matrisi"
        sub="Ders–program çıktısı ilişki matrisi. Her hücrede ilişki düzeyini (Düşük / Orta / Yüksek) seçin; değişiklik anında kaydedilir. Hiçbir derse bağlanmayan çıktılar kapsam boşluğu olarak işaretlenir."
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
        {mErr && <Alert tone="err">{mErr}</Alert>}
        {selProgram && (
          <p className="hint" style={{ marginTop: 8 }}>
            Satırlar canlı müfredat derslerinden, sütunlar {selProgram.code} programının çıktılarından
            gelir. Program çıktısı yoksa önce &quot;Program Çıktıları (PÇ)&quot; sayfasından tanımlayın.
          </p>
        )}
      </Card>

      {busy && <SkeletonStats n={5} />}
      {busy && <Skeleton lines={6} />}

      {stats && matrix && (
        <>
          <StatGrid
            stats={[
              { label: 'Ders (satır)', value: stats.courses, icon: 'book' },
              { label: 'Program Çıktısı (sütun)', value: stats.outcomes, icon: 'target' },
              { label: 'Tanımlı İlişki', value: stats.relations, icon: 'link' },
              { label: 'Kapsanan PÇ', value: stats.covered, icon: 'checkCircle', tone: 'ok' },
              {
                label: 'Kapsanmayan PÇ',
                value: stats.uncovered,
                icon: 'alert',
                tone: stats.uncovered > 0 ? 'danger' : 'ok',
              },
            ]}
          />

          {matrix.outcomes.length > 0 && matrix.rows.length > 0 && (
            <Card title="Matris Kapsama Özeti" icon="pie">
              <Meter
                value={stats.coveragePct}
                label={`PÇ kapsama: %${stats.coveragePct} (${stats.covered}/${stats.outcomes} çıktı en az bir derse bağlı)`}
              />
              <div style={{ marginTop: 12 }}>
                <Meter
                  value={stats.densityPct}
                  label={`Matris doluluk yoğunluğu: %${stats.densityPct} (${stats.relations} ilişki tanımlı)`}
                />
              </div>
            </Card>
          )}

          {matrix.outcomes.length === 0 ? (
            <Alert tone="err">
              Bu programın hiç program çıktısı (PÇ) yok. Matris için önce &quot;Program Çıktıları
              (PÇ)&quot; sayfasından en az bir çıktı tanımlayın.
            </Alert>
          ) : matrix.rows.length === 0 ? (
            <EmptyState icon="book" title="Ders bulunmuyor" sub="Bu müfredat versiyonunda ders tanımı yok, matris oluşturulamıyor." />
          ) : (
            <>
              {stats.uncovered > 0 && (
                <Alert tone="warn">
                  {stats.uncovered} program çıktısı hiçbir derse bağlanmamış (
                  {stats.uncoveredOutcomeIds.join(', ')}). Kapsamı tamamlamak için ilgili hücrelere
                  ilişki düzeyi girin.
                </Alert>
              )}
              {stats.uncoveredCourses > 0 && (
                <Alert tone="warn">
                  {stats.uncoveredCourses} ders hiçbir program çıktısıyla ilişkilendirilmemiş.
                </Alert>
              )}

              <Card
                title="İlişki Matrisi"
                icon="grid"
                hint='Her hücrede açılır menüden ilişki düzeyini seçin. Renk yoğunluğu düzeyi gösterir (açık = düşük, koyu = yüksek); "—" ilişki yok anlamına gelir.'
              >
                <div style={{ overflowX: 'auto' }}>
                  <table className="matrix-table">
                    <thead>
                      <tr>
                        <th
                          style={{
                            position: 'sticky',
                            left: 0,
                            background: 'var(--surface, #fff)',
                            zIndex: 2,
                            textAlign: 'left',
                          }}
                        >
                          Ders
                        </th>
                        {matrix.outcomes.map((o) => (
                          <th key={o.id} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {o.code}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.rows.map((r) => (
                        <tr key={r.courseCode}>
                          <td
                            style={{
                              position: 'sticky',
                              left: 0,
                              background: 'var(--surface, #fff)',
                              zIndex: 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <b>{r.courseCode}</b>{' '}
                            <span className="muted" style={{ fontSize: 12 }}>
                              {r.courseName}
                            </span>
                          </td>
                          {r.cells.map((c) => {
                            const key = `${r.courseCode}:${c.outcomeId}`;
                            return (
                              <td
                                key={c.outcomeId}
                                style={{
                                  textAlign: 'center',
                                  background: cellBg(c.level),
                                  padding: 2,
                                  opacity: saving === key ? 0.5 : 1,
                                }}
                              >
                                <select
                                  value={c.level}
                                  disabled={saving === key}
                                  onChange={(e) => setCell(r, c.outcomeId, Number(e.target.value))}
                                  title={LEVEL_LABEL[c.level]}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    fontWeight: c.level >= 2 ? 600 : 400,
                                    color: c.level >= 3 ? '#fff' : 'inherit',
                                    cursor: 'pointer',
                                    minWidth: 44,
                                  }}
                                >
                                  {LEVELS.map((l) => (
                                    <option key={l} value={l}>
                                      {l === 0 ? '—' : l}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row" style={{ gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                  <LegendChip bg={cellBg(1)} label="1 · Düşük" />
                  <LegendChip bg={cellBg(2)} label="2 · Orta" />
                  <LegendChip bg={cellBg(3)} label="3 · Yüksek" />
                  <span className="hint">0 / — seçimi ilişkiyi kaldırır.</span>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}

function LegendChip({ bg, label }: { bg: string; label: string }): React.ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          background: bg,
          border: '1px solid var(--border)',
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}
