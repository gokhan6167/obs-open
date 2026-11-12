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

interface Discipline {
  id: string;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  category: string;
  penalty: string;
  reason: string | null;
  decisionNo: string | null;
  decisionDate: string | null;
  startsOn: string | null;
  endsOn: string | null;
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

type Category = 'uyari' | 'kinama' | 'uzaklastirma' | 'cikarma';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'uyari', label: 'Uyarı' },
  { value: 'kinama', label: 'Kınama' },
  { value: 'uzaklastirma', label: 'Uzaklaştırma' },
  { value: 'cikarma', label: 'Yükseköğretimden çıkarma' },
];

const catLabel = (c: string): string => CATEGORIES.find((x) => x.value === c)?.label ?? c;

function categoryTone(c: string): 'info' | 'warn' | 'danger' {
  if (c === 'cikarma') return 'danger';
  if (c === 'uzaklastirma' || c === 'kinama') return 'warn';
  return 'info';
}

function statusTone(s: string): 'ok' | 'warn' | 'muted' {
  const v = s.toLowerCase();
  if (v === 'aktif') return 'warn';
  if (v === 'tamamlandi' || v === 'kaldirildi') return 'muted';
  return 'ok';
}

export default function DisiplinPage(): React.ReactElement {
  const [rows, setRows] = useState<Discipline[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Yeni ceza sürgüsü.
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [category, setCategory] = useState<Category>('uyari');
  const [penalty, setPenalty] = useState('');
  const [reason, setReason] = useState('');
  const [decisionNo, setDecisionNo] = useState('');
  const [decisionDate, setDecisionDate] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    const res = await api<{ items: Discipline[] }>('/discipline');
    setRows(res.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const stats = useMemo(() => {
    const students = new Set(rows.map((r) => r.studentId));
    const active = rows.filter((r) => r.status.toLowerCase() === 'aktif').length;
    const severe = rows.filter(
      (r) => r.category === 'uzaklastirma' || r.category === 'cikarma',
    ).length;
    return { total: rows.length, students: students.size, active, severe };
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
    if (!penalty.trim()) {
      setFormErr('Ceza özeti zorunludur.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api('/discipline', {
        method: 'POST',
        body: {
          studentId: picked.id,
          category,
          penalty: penalty.trim(),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(decisionNo.trim() ? { decisionNo: decisionNo.trim() } : {}),
          ...(decisionDate ? { decisionDate } : {}),
          ...(startsOn ? { startsOn } : {}),
          ...(endsOn ? { endsOn } : {}),
        },
      });
      toast('Disiplin cezası kaydedildi', {
        tone: 'ok',
        body: `${picked.studentNo} · ${catLabel(category)}`,
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
    setCategory('uyari');
    setPenalty('');
    setReason('');
    setDecisionNo('');
    setDecisionDate('');
    setStartsOn('');
    setEndsOn('');
    setFormErr('');
  }

  return (
    <>
      <PageHeader
        title="Disiplin işlemleri"
        sub="Öğrenci disiplin cezaları kayıtları. YKK kararı ile yeni ceza tanımlayın."
        actions={
          <Button icon="alert" onClick={() => setOpen(true)}>
            Yeni ceza
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam kayıt', value: stats.total, icon: 'alert' },
            { label: 'Cezalı öğrenci', value: stats.students, icon: 'users' },
            { label: 'Aktif ceza', value: stats.active, icon: 'clock', tone: 'warn' },
            { label: 'Ağır ceza', value: stats.severe, icon: 'alert', tone: 'danger' },
          ]}
        />
      )}

      <Card title="Disiplin kayıtları" icon="alert">
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Discipline>
            rows={rows}
            search
            csv
            csvName="oidb-disiplin"
            empty={
              <EmptyState
                icon="alert"
                title="Henüz disiplin kaydı yok"
                sub="Sağ üstten yeni ceza ekleyebilirsiniz."
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
                key: 'studentEmail',
                header: 'Öğrenci',
                sortable: true,
                value: (r) => r.studentEmail,
              },
              {
                key: 'category',
                header: 'Kategori',
                sortable: true,
                value: (r) => r.category,
                render: (r) => (
                  <Badge tone={categoryTone(r.category)}>{catLabel(r.category)}</Badge>
                ),
              },
              {
                key: 'penalty',
                header: 'Ceza',
                sortable: true,
                value: (r) => r.penalty,
              },
              {
                key: 'decisionNo',
                header: 'YKK No',
                sortable: true,
                value: (r) => r.decisionNo ?? '',
                render: (r) => r.decisionNo ?? <span className="muted">—</span>,
              },
              {
                key: 'decisionDate',
                header: 'Karar Tarihi',
                sortable: true,
                value: (r) => r.decisionDate ?? '',
                render: (r) =>
                  r.decisionDate ? fmtDate(r.decisionDate) : <span className="muted">—</span>,
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

      <Drawer open={open} onClose={closeDrawer} title="Yeni disiplin cezası">
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

        <h2>2 · Ceza bilgisi</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label>Kategori</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Ceza özeti</label>
            <input
              value={penalty}
              onChange={(e) => setPenalty(e.target.value)}
              placeholder="Örn. 1 hafta uzaklaştırma"
              required
            />
          </div>

          <div className="field">
            <label>Gerekçe</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Olayın kısa açıklaması"
            />
          </div>

          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label>YKK karar no</label>
              <input
                value={decisionNo}
                onChange={(e) => setDecisionNo(e.target.value)}
                placeholder="YK-2025/42"
              />
            </div>
            <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label>Karar tarihi</label>
              <input
                type="date"
                value={decisionDate}
                onChange={(e) => setDecisionDate(e.target.value)}
              />
            </div>
          </div>

          <div className="row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
            <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label>Başlangıç</label>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label>Bitiş</label>
              <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="alert" disabled={saving || !picked} block>
              {saving ? 'Kaydediliyor…' : 'Cezayı kaydet'}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
