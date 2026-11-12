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
  Segmented,
  Skeleton,
  SkeletonStats,
  Drawer,
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

interface Proficiency {
  id: string;
  studentId: string | null;
  studentNo: string | null;
  studentName: string | null;
  applicantId: string | null;
  applicantName: string | null;
  examType: string;
  score: string | null;
  examDate: string | null;
  result: string;
  note: string | null;
  createdAt: string;
}

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
}

type Tab = 'all' | 'prep';
type ExamType = 'toefl' | 'pte' | 'yds' | 'yokdil' | 'kurum_ici';
type Result = 'muaf' | 'hazirlik' | 'beklemede';

const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: 'toefl', label: 'TOEFL' },
  { value: 'pte', label: 'PTE' },
  { value: 'yds', label: 'YDS' },
  { value: 'yokdil', label: 'YÖKDİL' },
  { value: 'kurum_ici', label: 'Kurum içi muafiyet sınavı' },
];

const RESULTS: { value: Result; label: string }[] = [
  { value: 'muaf', label: 'Muaf' },
  { value: 'hazirlik', label: 'Hazırlık' },
  { value: 'beklemede', label: 'Beklemede' },
];

const examLabel = (t: string): string => EXAM_TYPES.find((x) => x.value === t)?.label ?? t;
const resultLabel = (r: string): string => RESULTS.find((x) => x.value === r)?.label ?? r;

function resultTone(r: string): 'ok' | 'warn' | 'muted' {
  if (r === 'muaf') return 'ok';
  if (r === 'hazirlik') return 'warn';
  return 'muted';
}

/** Kayıt sahibi: öğrenci ise "no · ad", aday ise aday adı. */
const personName = (r: Proficiency): string =>
  r.studentId ? (r.studentName ?? r.studentNo ?? '—') : (r.applicantName ?? '—');

const scoreOf = (r: Proficiency): number | null => {
  if (r.score == null || r.score === '') return null;
  const n = Number(r.score);
  return Number.isNaN(n) ? null : n;
};

/** Puan → beklenen sonuç (backend kuralının aynısı; formda önizleme için). */
function previewResult(score: string): Result | null {
  if (!score.trim()) return null;
  const n = Number(score);
  if (Number.isNaN(n)) return null;
  if (n >= 65) return 'muaf';
  if (n >= 50) return 'beklemede';
  return 'hazirlik';
}

export default function DilHazirlikPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('all');
  const [rows, setRows] = useState<Proficiency[]>([]);
  const [prep, setPrep] = useState<Proficiency[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Yeni kayıt sürgüsü.
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [examType, setExamType] = useState<ExamType>('yds');
  const [score, setScore] = useState('');
  const [examDate, setExamDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // Sonuç güncelleme sürgüsü.
  const [edit, setEdit] = useState<Proficiency | null>(null);
  const [editResult, setEditResult] = useState<Result>('beklemede');
  const [editNote, setEditNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [editErr, setEditErr] = useState('');

  const load = useCallback(async () => {
    const [all, prepRes] = await Promise.all([
      api<{ items: Proficiency[] }>('/language/proficiencies'),
      api<{ items: Proficiency[] }>('/language/prep-list'),
    ]);
    setRows(all.items ?? []);
    setPrep(prepRes.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      muaf: rows.filter((r) => r.result === 'muaf').length,
      hazirlik: rows.filter((r) => r.result === 'hazirlik').length,
      beklemede: rows.filter((r) => r.result === 'beklemede').length,
    }),
    [rows],
  );

  async function search(): Promise<void> {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setFormErr('');
    try {
      const res = await api<{ items: StudentHit[] }>(
        `/portal/students?q=${encodeURIComponent(term)}`,
      );
      setHits(res.items ?? []);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Arama başarısız');
    } finally {
      setSearching(false);
    }
  }

  function closeDrawer(): void {
    setOpen(false);
    setQ('');
    setHits([]);
    setPicked(null);
    setExamType('yds');
    setScore('');
    setExamDate('');
    setNote('');
    setFormErr('');
  }

  async function submit(): Promise<void> {
    if (!picked) {
      setFormErr('Önce öğrenci seçin.');
      return;
    }
    const n = score.trim() ? Number(score) : undefined;
    if (n !== undefined && (Number.isNaN(n) || n < 0 || n > 100)) {
      setFormErr('Puan 0-100 aralığında olmalıdır.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api('/language/proficiencies', {
        method: 'POST',
        body: {
          studentId: picked.id,
          examType,
          ...(n !== undefined ? { score: n } : {}),
          ...(examDate ? { examDate } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      toast('Dil yeterlilik kaydı oluşturuldu', {
        tone: 'ok',
        body: `${picked.studentNo} · ${examLabel(examType)}${n !== undefined ? ` · ${n} puan` : ''}`,
      });
      closeDrawer();
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  function openEdit(r: Proficiency): void {
    setEdit(r);
    setEditResult((RESULTS.find((x) => x.value === r.result)?.value ?? 'beklemede') as Result);
    setEditNote(r.note ?? '');
    setEditErr('');
  }

  async function saveResult(): Promise<void> {
    if (!edit) return;
    setUpdating(true);
    setEditErr('');
    try {
      await api(`/language/proficiencies/${edit.id}`, {
        method: 'PATCH',
        body: { result: editResult, ...(editNote.trim() ? { note: editNote.trim() } : {}) },
      });
      toast('Sonuç güncellendi', {
        tone: 'ok',
        body: `${personName(edit)} · ${resultLabel(editResult)}`,
      });
      setEdit(null);
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Güncelleme başarısız';
      setEditErr(m);
      toast('Güncelleme başarısız', { tone: 'err', body: m });
    } finally {
      setUpdating(false);
    }
  }

  const shown = tab === 'prep' ? prep : rows;
  const preview = previewResult(score);

  return (
    <>
      <PageHeader
        title="Dil Yeterlilik / Hazırlık"
        sub="Yabancı dil muafiyet sınav sonuçları ve hazırlık programına düşen öğrenciler."
        actions={
          <Button icon="book" onClick={() => setOpen(true)}>
            Yeni kayıt
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam kayıt', value: stats.total, icon: 'fileText' },
            { label: 'Muaf', value: stats.muaf, icon: 'checkCircle', tone: 'ok' },
            { label: 'Hazırlığa düşen', value: stats.hazirlik, icon: 'book', tone: 'warn' },
            { label: 'Beklemede', value: stats.beklemede, icon: 'clock' },
          ]}
        />
      )}

      <Card
        title={tab === 'prep' ? 'Hazırlığa düşenler' : 'Dil yeterlilik kayıtları'}
        icon="book"
        actions={
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'all', label: 'Tüm Kayıtlar' },
              { value: 'prep', label: 'Hazırlığa Düşenler' },
            ]}
          />
        }
        hint="Muafiyet eşiği: 65 ve üstü muaf, 50-64 beklemede, 50 altı hazırlık."
      >
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Proficiency>
            rows={shown}
            search
            csv
            csvName={tab === 'prep' ? 'oidb-hazirlik-listesi' : 'oidb-dil-yeterlilik'}
            empty={
              <EmptyState
                icon="book"
                title={tab === 'prep' ? 'Hazırlığa düşen kimse yok' : 'Henüz dil yeterlilik kaydı yok'}
                sub={
                  tab === 'prep'
                    ? 'Sonucu "hazırlık" olan kayıtlar burada listelenir.'
                    : 'Sağ üstten yeni sınav sonucu ekleyebilirsiniz.'
                }
              />
            }
            columns={[
              {
                key: 'person',
                header: 'Öğrenci / Aday',
                sortable: true,
                value: (r) => personName(r),
                render: (r) => (
                  <span>
                    {r.studentNo && <b>{r.studentNo}</b>}
                    {r.studentNo && ' · '}
                    {personName(r)}
                  </span>
                ),
              },
              {
                key: 'kind',
                header: 'Tip',
                sortable: true,
                value: (r) => (r.studentId ? 'Öğrenci' : 'Aday'),
                render: (r) => (
                  <Badge tone={r.studentId ? 'info' : 'muted'}>
                    {r.studentId ? 'Öğrenci' : 'Aday'}
                  </Badge>
                ),
              },
              {
                key: 'examType',
                header: 'Sınav Tipi',
                sortable: true,
                value: (r) => examLabel(r.examType),
                render: (r) => examLabel(r.examType),
              },
              {
                key: 'score',
                header: 'Puan',
                num: true,
                sortable: true,
                value: (r) => scoreOf(r) ?? -1,
                render: (r) => {
                  const s = scoreOf(r);
                  return s == null ? <span className="muted">—</span> : <b>{s}</b>;
                },
              },
              {
                key: 'examDate',
                header: 'Sınav Tarihi',
                sortable: true,
                value: (r) => r.examDate ?? '',
                render: (r) => fmtDate(r.examDate),
              },
              {
                key: 'result',
                header: 'Sonuç',
                sortable: true,
                value: (r) => resultLabel(r.result),
                render: (r) => <Badge tone={resultTone(r.result)}>{resultLabel(r.result)}</Badge>,
              },
              {
                key: 'actions',
                header: '',
                sortable: false,
                value: () => '',
                render: (r) => (
                  <Button variant="ghost" sm icon="edit" onClick={() => openEdit(r)}>
                    Sonuç
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer open={open} onClose={closeDrawer} title="Yeni dil yeterlilik kaydı">
        {formErr && <Alert tone="err">{formErr}</Alert>}

        <h2 style={{ marginTop: 0 }}>1 · Öğrenci</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label>Öğrenci no / ad ile ara</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="20210001 veya ad"
              />
            </div>
            <Button variant="ghost" type="submit" icon="search" disabled={searching}>
              {searching ? 'Aranıyor…' : 'Ara'}
            </Button>
          </div>
        </form>

        {picked ? (
          <div className="info-box" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
              <span>
                <b>{picked.studentNo}</b> · {picked.fullName}
              </span>
              <Button variant="ghost" sm icon="refresh" onClick={() => setPicked(null)}>
                Değiştir
              </Button>
            </div>
          </div>
        ) : (
          hits.length > 0 && (
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
          )
        )}

        <h2>2 · Sınav bilgisi</h2>
        <Alert tone="info">
          Sonuç puandan otomatik belirlenir: 65 ve üstü <b>muaf</b>, 50-64 <b>beklemede</b>, 50 altı{' '}
          <b>hazırlık</b>. Puan girilmezse kayıt beklemede açılır.
        </Alert>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label>Sınav tipi</label>
            <select value={examType} onChange={(e) => setExamType(e.target.value as ExamType)}>
              {EXAM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 120px', marginBottom: 0 }}>
              <label>Puan (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="Örn. 72"
              />
            </div>
            <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label>Sınav tarihi</label>
              <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
          </div>

          {preview && (
            <div className="row" style={{ marginTop: 10 }}>
              <span className="muted">Beklenen sonuç:</span>
              <Badge tone={resultTone(preview)}>{resultLabel(preview)}</Badge>
            </div>
          )}

          <div className="field" style={{ marginTop: 15 }}>
            <label>Not</label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Opsiyonel açıklama"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="book" disabled={saving || !picked} block>
              {saving ? 'Kaydediliyor…' : 'Kaydı oluştur'}
            </Button>
          </div>
        </form>
      </Drawer>

      <Drawer open={edit !== null} onClose={() => setEdit(null)} title="Sonucu güncelle">
        {edit && (
          <>
            {editErr && <Alert tone="err">{editErr}</Alert>}
            <div className="info-box">
              <div>
                <b>{personName(edit)}</b>
              </div>
              <div className="muted">
                {examLabel(edit.examType)} · {scoreOf(edit) ?? '—'} puan · {fmtDate(edit.examDate)}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveResult();
              }}
            >
              <div className="field" style={{ marginTop: 15 }}>
                <label>Sonuç</label>
                <select
                  value={editResult}
                  onChange={(e) => setEditResult(e.target.value as Result)}
                >
                  {RESULTS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Not</label>
                <textarea
                  rows={3}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Karar gerekçesi (opsiyonel)"
                />
              </div>

              <Button type="submit" icon="check" disabled={updating} block>
                {updating ? 'Güncelleniyor…' : 'Sonucu kaydet'}
              </Button>
            </form>
          </>
        )}
      </Drawer>
    </>
  );
}
