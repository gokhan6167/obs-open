'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Alert,
  Skeleton,
  SkeletonStats,
  Drawer,
  EmptyState,
  Segmented,
} from '@/app/ui';

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programId: string;
  programName: string;
  status: string;
  gpa: number | null;
}
interface RecentGrade {
  courseCode: string;
  courseName: string;
  letter: string | null;
  rawScore: number | null;
  status: string;
  termName: string;
  year: number;
}
interface AcademicSummary {
  id: string;
  studentNo: string;
  status: string;
  program: { id: string; name: string; code: string };
  gpa: number | null;
  completedEcts: number;
  remainingEcts: number;
  advisorName: string | null;
  classYear: number;
  maxDurationLeft: number;
  activeCourseCount: number;
  recentGrades: RecentGrade[];
}
interface TimelineItem {
  at: string;
  action: string;
  actorName: string;
  diff: { status?: string; reason?: string; diplomaNo?: string };
}

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  kayit_dondurma: 'Kayıt donduruldu',
  pasif: 'Pasif',
  iliskigi_kesildi: 'İlişiği kesildi',
  mezun: 'Mezun',
  azami_sure_doldu: 'Azami süre doldu',
  af_ogrencisi: 'Af öğrencisi',
};

function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'muted' {
  if (s === 'aktif') return 'ok';
  if (s === 'mezun') return 'muted';
  if (s === 'iliskigi_kesildi' || s === 'azami_sure_doldu') return 'danger';
  return 'warn';
}

function actionTr(a: string): string {
  const map: Record<string, string> = {
    'student.status_change': 'Durum değişikliği',
    'student.create': 'Öğrenci oluşturuldu',
    'student.update': 'Öğrenci güncellendi',
  };
  return map[a] ?? a;
}

function fmtDateTime(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function BolumOgrenciler(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const [program, setProgram] = useState('');
  const [status, setStatus] = useState('');

  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [summary, setSummary] = useState<AcademicSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [detailErr, setDetailErr] = useState('');

  useEffect(() => {
    api<{ items: StudentRow[] }>('/portal/students')
      .then((d) => setRows(d.items))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  const programOptions = useMemo(
    () => [...new Set(rows.map((r) => r.programName))].sort(),
    [rows],
  );
  const statusOptions = useMemo(
    () => [...new Set(rows.map((r) => r.status))].sort(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (program && r.programName !== program) return false;
        if (status && r.status !== status) return false;
        return true;
      }),
    [rows, program, status],
  );

  async function openCard(r: StudentRow): Promise<void> {
    setSelected(r);
    setSummary(null);
    setTimeline(null);
    setDetailErr('');
    setCardBusy(true);
    try {
      const [s, t] = await Promise.all([
        api<AcademicSummary>(`/students/${r.id}/academic-summary`),
        api<{ items: TimelineItem[] }>(`/students/${r.id}/timeline`).catch(() => ({ items: [] })),
      ]);
      setSummary(s);
      setTimeline(t.items ?? []);
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Kart yüklenemedi');
    } finally {
      setCardBusy(false);
    }
  }

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Bölüm Öğrencileri"
        sub="Program ve durum ile filtreleyin; satırdaki Kart ile öğrenci akademik kartını ve durum zaman çizelgesini açın."
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam (ilk 100)', value: rows.length, icon: 'users' },
            {
              label: 'Aktif',
              value: rows.filter((r) => r.status === 'aktif').length,
              icon: 'checkCircle',
            },
            { label: 'Filtre sonucu', value: filtered.length, icon: 'filter' },
            {
              label: 'GNO < 2.00',
              value: rows.filter((r) => r.gpa != null && r.gpa < 2.0).length,
              icon: 'alert',
              tone: rows.some((r) => r.gpa != null && r.gpa < 2.0) ? 'danger' : undefined,
            },
          ]}
        />
      )}

      <Card title="Filtreler" icon="filter">
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div className="field">
            <label>Program</label>
            <select value={program} onChange={(e) => setProgram(e.target.value)}>
              <option value="">Tümü</option>
              {programOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Durum</label>
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: 'Tümü' },
                ...statusOptions.map((s) => ({ value: s, label: STATUS_TR[s] ?? s })),
              ]}
            />
          </div>
        </div>
      </Card>

      <Card title="Öğrenci Listesi" icon="users">
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<StudentRow>
            rows={filtered}
            search
            csv
            csvName="bolum-ogrenciler"
            empty={
              <EmptyState
                icon="users"
                title="Filtreye uyan öğrenci bulunamadı"
                sub="Program veya durum filtresini gevşetin."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => <b>{r.studentNo}</b>,
              },
              {
                key: 'fullName',
                header: 'Ad / E-posta',
                sortable: true,
                value: (r) => r.fullName,
              },
              {
                key: 'programName',
                header: 'Program',
                sortable: true,
                value: (r) => r.programName,
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={statusTone(r.status)}>{STATUS_TR[r.status] ?? r.status}</Badge>
                ),
              },
              {
                key: 'gpa',
                header: 'GNO',
                sortable: true,
                num: true,
                value: (r) => (r.gpa != null ? r.gpa : -1),
                render: (r) => (r.gpa != null ? r.gpa.toFixed(2) : '—'),
              },
              {
                key: 'action',
                header: '',
                render: (r) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => openCard(r)}>
                    Kart
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Öğrenci Kartı · ${selected.studentNo}` : undefined}
      >
        {selected && (
          <>
            <p className="hint">
              {selected.fullName} · {selected.programName}
            </p>
            {detailErr && <Alert tone="err">{detailErr}</Alert>}
            {cardBusy ? (
              <Skeleton lines={8} />
            ) : summary ? (
              <>
                <StatGrid
                  stats={[
                    {
                      label: 'GNO',
                      value: summary.gpa != null ? summary.gpa.toFixed(2) : '—',
                      icon: 'grade',
                      tone: summary.gpa != null && summary.gpa < 2.0 ? 'danger' : undefined,
                    },
                    { label: 'Kazanılan AKTS', value: summary.completedEcts, icon: 'award' },
                    {
                      label: 'Kalan zorunlu AKTS',
                      value: summary.remainingEcts,
                      icon: 'layers',
                    },
                    { label: 'Sınıf', value: summary.classYear, icon: 'user' },
                    { label: 'Aktif ders', value: summary.activeCourseCount, icon: 'book' },
                    {
                      label: 'Azami süre (yıl)',
                      value: summary.maxDurationLeft,
                      icon: 'clock',
                      tone: summary.maxDurationLeft <= 1 ? 'danger' : undefined,
                    },
                  ]}
                />

                <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Badge tone={statusTone(summary.status)}>
                    {STATUS_TR[summary.status] ?? summary.status}
                  </Badge>
                  <Badge tone="muted">Danışman: {summary.advisorName ?? 'atanmadı'}</Badge>
                  {summary.maxDurationLeft <= 1 && <Badge tone="danger">Azami süre kritik</Badge>}
                  {summary.gpa != null && summary.gpa < 2.0 && (
                    <Badge tone="danger">GNO riskli</Badge>
                  )}
                </div>

                <h2 style={{ marginTop: 16 }}>Son Notlar</h2>
                {summary.recentGrades.length === 0 ? (
                  <EmptyState icon="grade" title="Kayıtlı not yok" />
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Dönem</th>
                        <th>Ders</th>
                        <th>Harf</th>
                        <th>Ham</th>
                        <th>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recentGrades.map((g, i) => (
                        <tr key={`${g.courseCode}-${i}`}>
                          <td>
                            {g.termName} <span className="muted">({g.year})</span>
                          </td>
                          <td>
                            <b>{g.courseCode}</b> · {g.courseName}
                          </td>
                          <td>
                            {g.letter ? (
                              <Badge tone={['FF', 'NA', 'DZ'].includes(g.letter) ? 'danger' : 'ok'}>
                                {g.letter}
                              </Badge>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>{g.rawScore ?? '—'}</td>
                          <td>
                            <Badge tone="muted">{g.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h2 style={{ marginTop: 16 }}>Durum Zaman Çizelgesi</h2>
                {!timeline || timeline.length === 0 ? (
                  <EmptyState icon="clock" title="Kayıtlı işlem geçmişi yok" />
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {timeline.map((t, i) => (
                      <li key={i} className="list-item">
                        <b>{actionTr(t.action)}</b>
                        {t.diff.status && (
                          <>
                            {' '}
                            <Badge tone={statusTone(t.diff.status)}>
                              {STATUS_TR[t.diff.status] ?? t.diff.status}
                            </Badge>
                          </>
                        )}
                        {t.diff.reason && <span> — {t.diff.reason}</span>}
                        <span className="meta">
                          {' '}
                          · {fmtDateTime(t.at)} · {t.actorName}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </>
        )}
      </Drawer>
    </>
  );
}
