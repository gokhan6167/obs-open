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
  Alert,
  Skeleton,
  SkeletonStats,
  Drawer,
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | null;
}

interface GradeRow {
  courseCode: string;
  courseName: string;
  letter: string | null;
  rawScore: number | null;
  status: string;
  termName: string;
  year: number;
}

interface GradesResponse {
  items: GradeRow[];
  gpa: number | null;
}

interface Adaptation {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  type: string;
  sourceCourse: string;
  letter: string | null;
  decisionNo: string | null;
  status: string;
  createdAt: string;
}

type AdaptationType = 'intibak' | 'muaf' | 'transfer';

const TYPES: { value: AdaptationType; label: string }[] = [
  { value: 'intibak', label: 'İntibak' },
  { value: 'muaf', label: 'Muafiyet' },
  { value: 'transfer', label: 'Transfer' },
];

const typeLabel = (t: string): string => TYPES.find((x) => x.value === t)?.label ?? t;

function typeTone(t: string): 'info' | 'warn' | 'ok' {
  if (t === 'transfer') return 'warn';
  if (t === 'muaf') return 'ok';
  return 'info';
}

function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'muted' {
  const v = s.toLowerCase();
  if (v === 'onaylandi' || v === 'approved' || v === 'gecti' || v === 'passed') return 'ok';
  if (v === 'reddedildi' || v === 'rejected' || v === 'kaldi' || v === 'failed') return 'danger';
  if (v === 'beklemede' || v === 'pending' || v === 'devam' || v === 'inprogress') return 'warn';
  return 'muted';
}

export default function OgrenciDersPage(): React.ReactElement {
  // Öğrenci arama.
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');
  const [searched, setSearched] = useState(false);

  // Seçili öğrenci + verileri.
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataErr, setDataErr] = useState('');
  const [grades, setGrades] = useState<GradesResponse | null>(null);
  const [adaptations, setAdaptations] = useState<Adaptation[]>([]);

  // İntibak ekleme sürgüsü.
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AdaptationType>('intibak');
  const [sourceCourse, setSourceCourse] = useState('');
  const [letter, setLetter] = useState('');
  const [decisionNo, setDecisionNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  async function search(): Promise<void> {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setSearchErr('');
    try {
      const res = await api<{ items: StudentHit[] }>(
        `/portal/students?q=${encodeURIComponent(term)}`,
      );
      setHits(res.items ?? []);
      setSearched(true);
    } catch (e) {
      setSearchErr(e instanceof Error ? e.message : 'Arama başarısız');
    } finally {
      setSearching(false);
    }
  }

  const loadStudent = useCallback(async (stu: StudentHit): Promise<void> => {
    setLoading(true);
    setDataErr('');
    setGrades(null);
    setAdaptations([]);
    try {
      const [g, a] = await Promise.all([
        api<GradesResponse>(`/students/${stu.id}/grades`),
        api<{ items: Adaptation[] }>(`/adaptation?studentId=${encodeURIComponent(stu.id)}`),
      ]);
      setGrades({ items: g.items ?? [], gpa: g.gpa ?? null });
      setAdaptations(a.items ?? []);
    } catch (e) {
      setDataErr(e instanceof Error ? e.message : 'Öğrenci verileri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (picked) void loadStudent(picked);
  }, [picked, loadStudent]);

  const stats = useMemo(() => {
    const items = grades?.items ?? [];
    const passed = items.filter((r) => statusTone(r.status) === 'ok').length;
    return {
      total: items.length,
      passed,
      adaptations: adaptations.length,
    };
  }, [grades, adaptations]);

  async function submit(): Promise<void> {
    if (!picked) return;
    if (!sourceCourse.trim()) {
      setFormErr('Kaynak ders zorunludur.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api('/adaptation', {
        method: 'POST',
        body: {
          studentId: picked.id,
          type,
          sourceCourse: sourceCourse.trim(),
          ...(letter.trim() ? { letter: letter.trim() } : {}),
          ...(decisionNo.trim() ? { decisionNo: decisionNo.trim() } : {}),
        },
      });
      toast('İntibak kaydı oluşturuldu', {
        tone: 'ok',
        body: `${picked.studentNo} · ${typeLabel(type)} · ${sourceCourse.trim()}`,
      });
      closeDrawer();
      await loadStudent(picked);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  function closeDrawer(): void {
    setOpen(false);
    setType('intibak');
    setSourceCourse('');
    setLetter('');
    setDecisionNo('');
    setFormErr('');
  }

  function reset(): void {
    setPicked(null);
    setGrades(null);
    setAdaptations([]);
    setDataErr('');
  }

  return (
    <>
      <PageHeader
        title="Öğrenci-ders yönetimi"
        sub="Öğrenci seçerek ders/not dökümünü ve intibak-muafiyet kayıtlarını görüntüleyin."
        actions={
          picked ? (
            <Button variant="ghost" icon="refresh" onClick={reset}>
              Öğrenci değiştir
            </Button>
          ) : undefined
        }
      />

      {!picked && (
        <Card title="Öğrenci ara" icon="search">
          {searchErr && <Alert tone="err">{searchErr}</Alert>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '1 1 240px', marginBottom: 0 }}>
                <label>Öğrenci no / ad ile ara</label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="20210001 veya ad"
                />
              </div>
              <Button type="submit" icon="search" disabled={searching}>
                {searching ? 'Aranıyor…' : 'Ara'}
              </Button>
            </div>
          </form>

          {hits.length > 0 ? (
            <table style={{ marginTop: 12 }}>
              <tbody>
                {hits.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <b>{h.studentNo}</b>
                    </td>
                    <td>{h.fullName}</td>
                    <td className="muted">{h.programName}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="ghost" sm icon="check" onClick={() => setPicked(h)}>
                        Seç
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            searched &&
            !searching && (
              <EmptyState
                icon="users"
                title="Öğrenci bulunamadı"
                sub="Farklı bir öğrenci no veya ad ile tekrar deneyin."
              />
            )
          )}
        </Card>
      )}

      {picked && (
        <>
          <Card title={`${picked.studentNo} · ${picked.fullName}`} icon="user">
            <div className="muted" style={{ marginBottom: 12 }}>
              {picked.programName}
            </div>
            {loading ? (
              <SkeletonStats n={3} />
            ) : (
              <StatGrid
                stats={[
                  { label: 'GNO', value: grades?.gpa != null ? grades.gpa.toFixed(2) : '—', icon: 'award' },
                  { label: 'Toplam ders', value: stats.total, icon: 'book' },
                  {
                    label: 'İntibak / muaf',
                    value: stats.adaptations,
                    icon: 'layers',
                    tone: 'ok',
                  },
                ]}
              />
            )}
          </Card>

          <Card title="Ders / not dökümü" icon="book">
            {dataErr && <Alert tone="err">{dataErr}</Alert>}
            {loading ? (
              <Skeleton lines={8} />
            ) : (
              <DataTable<GradeRow>
                rows={grades?.items ?? []}
                search
                csv
                csvName={`ogrenci-ders-${picked.studentNo}`}
                empty={
                  <EmptyState
                    icon="book"
                    title="Ders kaydı yok"
                    sub="Bu öğrenciye ait not dökümü bulunamadı."
                  />
                }
                columns={[
                  {
                    key: 'courseCode',
                    header: 'Kod',
                    sortable: true,
                    value: (r) => r.courseCode,
                    render: (r) => <b>{r.courseCode}</b>,
                  },
                  {
                    key: 'courseName',
                    header: 'Ders',
                    sortable: true,
                    value: (r) => r.courseName,
                  },
                  {
                    key: 'termName',
                    header: 'Dönem',
                    sortable: true,
                    value: (r) => `${r.year} ${r.termName}`,
                    render: (r) => (
                      <span className="muted">
                        {r.year} · {r.termName}
                      </span>
                    ),
                  },
                  {
                    key: 'letter',
                    header: 'Harf',
                    sortable: true,
                    value: (r) => r.letter ?? '',
                    render: (r) => r.letter ?? <span className="muted">—</span>,
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    sortable: true,
                    value: (r) => r.status,
                    render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
                  },
                ]}
              />
            )}
          </Card>

          <Card
            title="İntibak / muafiyet"
            icon="layers"
            actions={
              <Button sm icon="layers" onClick={() => setOpen(true)}>
                İntibak ekle
              </Button>
            }
          >
            {loading ? (
              <Skeleton lines={5} />
            ) : (
              <DataTable<Adaptation>
                rows={adaptations}
                empty={
                  <EmptyState
                    icon="layers"
                    title="İntibak kaydı yok"
                    sub="Bu öğrenci için intibak/muafiyet ekleyebilirsiniz."
                  />
                }
                columns={[
                  {
                    key: 'type',
                    header: 'Tür',
                    sortable: true,
                    value: (r) => r.type,
                    render: (r) => <Badge tone={typeTone(r.type)}>{typeLabel(r.type)}</Badge>,
                  },
                  {
                    key: 'sourceCourse',
                    header: 'Kaynak Ders',
                    sortable: true,
                    value: (r) => r.sourceCourse,
                  },
                  {
                    key: 'letter',
                    header: 'Harf',
                    sortable: true,
                    value: (r) => r.letter ?? '',
                    render: (r) => r.letter ?? <span className="muted">—</span>,
                  },
                  {
                    key: 'decisionNo',
                    header: 'Karar No',
                    sortable: true,
                    value: (r) => r.decisionNo ?? '',
                    render: (r) => r.decisionNo ?? <span className="muted">—</span>,
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    sortable: true,
                    value: (r) => r.status,
                    render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
                  },
                  {
                    key: 'createdAt',
                    header: 'Tarih',
                    sortable: true,
                    value: (r) => r.createdAt,
                    render: (r) => fmtDate(r.createdAt),
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}

      <Drawer open={open} onClose={closeDrawer} title="Yeni intibak kaydı">
        {formErr && <Alert tone="err">{formErr}</Alert>}

        {picked && (
          <div className="info-box" style={{ marginBottom: 12 }}>
            <b>{picked.studentNo}</b> · {picked.fullName}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label>Tür</label>
            <select value={type} onChange={(e) => setType(e.target.value as AdaptationType)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Kaynak ders</label>
            <input
              value={sourceCourse}
              onChange={(e) => setSourceCourse(e.target.value)}
              placeholder="Örn. MAT101 Matematik I"
              required
            />
          </div>

          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 120px', marginBottom: 0 }}>
              <label>Harf notu</label>
              <input
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                placeholder="Örn. AA"
              />
            </div>
            <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label>Karar no</label>
              <input
                value={decisionNo}
                onChange={(e) => setDecisionNo(e.target.value)}
                placeholder="YK-2025/42"
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="layers" disabled={saving} block>
              {saving ? 'Kaydediliyor…' : 'İntibakı kaydet'}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
