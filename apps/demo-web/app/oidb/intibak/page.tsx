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

interface Adaptation {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  type: string;
  sourceCourse: string;
  letter: string;
  decisionNo: string | null;
  status: string;
  createdAt: string;
}

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
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
  if (v === 'onaylandi' || v === 'approved') return 'ok';
  if (v === 'reddedildi' || v === 'rejected') return 'danger';
  if (v === 'beklemede' || v === 'pending') return 'warn';
  return 'muted';
}

export default function IntibakPage(): React.ReactElement {
  const [rows, setRows] = useState<Adaptation[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Yeni intibak sürgüsü.
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [type, setType] = useState<AdaptationType>('intibak');
  const [sourceCourse, setSourceCourse] = useState('');
  const [letter, setLetter] = useState('');
  const [decisionNo, setDecisionNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    const res = await api<{ items: Adaptation[] }>('/adaptation');
    setRows(res.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const stats = useMemo(() => {
    const students = new Set(rows.map((r) => r.studentId));
    return {
      total: rows.length,
      students: students.size,
      muaf: rows.filter((r) => r.type === 'muaf').length,
      transfer: rows.filter((r) => r.type === 'transfer').length,
    };
  }, [rows]);

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

  async function submit(): Promise<void> {
    if (!picked) {
      setFormErr('Önce öğrenci seçin.');
      return;
    }
    if (!sourceCourse.trim()) {
      setFormErr('Kaynak ders zorunludur.');
      return;
    }
    if (!letter.trim()) {
      setFormErr('Harf notu zorunludur.');
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
          letter: letter.trim(),
          ...(decisionNo.trim() ? { decisionNo: decisionNo.trim() } : {}),
        },
      });
      toast('İntibak kaydı oluşturuldu', {
        tone: 'ok',
        body: `${picked.studentNo} · ${typeLabel(type)} · ${sourceCourse.trim()}`,
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

  function closeDrawer(): void {
    setOpen(false);
    setQ('');
    setHits([]);
    setPicked(null);
    setType('intibak');
    setSourceCourse('');
    setLetter('');
    setDecisionNo('');
    setFormErr('');
  }

  return (
    <>
      <PageHeader
        title="İntibak / Muafiyet / Transfer"
        sub="Yatay-dikey geçiş ve muafiyet kararlarıyla ders intibak kayıtları."
        actions={
          <Button icon="layers" onClick={() => setOpen(true)}>
            Yeni intibak
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam kayıt', value: stats.total, icon: 'layers' },
            { label: 'Öğrenci', value: stats.students, icon: 'users' },
            { label: 'Muafiyet', value: stats.muaf, icon: 'checkCircle', tone: 'ok' },
            { label: 'Transfer', value: stats.transfer, icon: 'refresh', tone: 'warn' },
          ]}
        />
      )}

      <Card title="İntibak kayıtları" icon="layers">
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Adaptation>
            rows={rows}
            search
            csv
            csvName="oidb-intibak"
            empty={
              <EmptyState
                icon="layers"
                title="Henüz intibak kaydı yok"
                sub="Sağ üstten yeni intibak/muafiyet ekleyebilirsiniz."
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
                key: 'studentName',
                header: 'Öğrenci',
                sortable: true,
                value: (r) => r.studentName,
              },
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
                value: (r) => r.letter,
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

      <Drawer open={open} onClose={closeDrawer} title="Yeni intibak kaydı">
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

        <h2>2 · İntibak bilgisi</h2>
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
                required
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
            <Button type="submit" icon="layers" disabled={saving || !picked} block>
              {saving ? 'Kaydediliyor…' : 'İntibakı kaydet'}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
