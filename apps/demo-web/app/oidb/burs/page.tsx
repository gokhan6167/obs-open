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

interface Scholarship {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  type: string;
  rateBps: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
}

const pct = (bps: number): string => (bps / 100).toFixed(0);

export default function BursPage(): React.ReactElement {
  const [rows, setRows] = useState<Scholarship[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Yeni burs sürgüsü.
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [rate, setRate] = useState('');
  const [provider, setProvider] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    setRows(await api<Scholarship[]>('/finance/scholarships'));
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const stats = useMemo(() => {
    const students = new Set(rows.map((r) => r.studentId));
    const full = rows.filter((r) => r.rateBps >= 10000).length;
    const avg = rows.length
      ? Math.round(rows.reduce((s, r) => s + r.rateBps, 0) / rows.length / 100)
      : 0;
    return { total: rows.length, students: students.size, full, avg };
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
    const rateNum = Number(rate);
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) {
      setFormErr('Oran 0 ile 100 arasında olmalı.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api('/finance/scholarships', {
        method: 'POST',
        body: {
          studentId: picked.id,
          rateBps: Math.round(rateNum * 100),
          ...(provider.trim() ? { provider: provider.trim() } : {}),
        },
      });
      toast('Burs tanımlandı', {
        tone: 'ok',
        body: `${picked.studentNo} · %${rateNum}${provider.trim() ? ` · ${provider.trim()}` : ''}`,
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
    setRate('');
    setProvider('');
    setFormErr('');
  }

  return (
    <>
      <PageHeader
        title="Burslar"
        sub="Burslu öğrenci listesi. Oran ve kurumla yeni burs tanımlayın."
        actions={
          <Button icon="award" onClick={() => setOpen(true)}>
            Yeni burs
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam burs kaydı', value: stats.total, icon: 'award' },
            { label: 'Burslu öğrenci', value: stats.students, icon: 'users' },
            { label: 'Tam burslu', value: stats.full, icon: 'checkCircle', tone: 'ok' },
            { label: 'Ortalama oran', value: `%${stats.avg}`, icon: 'chart' },
          ]}
        />
      )}

      <Card title="Burslu öğrenciler" icon="award">
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Scholarship>
            rows={rows}
            search
            csv
            csvName="oidb-burslar"
            empty={
              <EmptyState
                icon="award"
                title="Henüz burs tanımlı değil"
                sub="Sağ üstten yeni burs ekleyebilirsiniz."
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
                header: 'Ad',
                sortable: true,
                value: (r) => r.studentName,
              },
              {
                key: 'rate',
                header: 'Oran',
                sortable: true,
                num: true,
                value: (r) => r.rateBps,
                render: (r) => (
                  <Badge tone={r.rateBps >= 10000 ? 'ok' : 'info'}>%{pct(r.rateBps)}</Badge>
                ),
              },
              {
                key: 'type',
                header: 'Kurum',
                sortable: true,
                value: (r) => r.type,
              },
              {
                key: 'effectiveFrom',
                header: 'Başlangıç',
                sortable: true,
                value: (r) => r.effectiveFrom,
                render: (r) => fmtDate(r.effectiveFrom),
              },
            ]}
          />
        )}
      </Card>

      <Drawer open={open} onClose={closeDrawer} title="Yeni burs tanımla">
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

        <h2>2 · Burs bilgisi</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 120px', marginBottom: 0 }}>
              <label>Oran (%)</label>
              <input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="numeric"
                placeholder="50"
                required
              />
            </div>
            <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label>Kurum</label>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Örn. KYK, Vakıf, Kurum"
              />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="award" disabled={saving || !picked} block>
              {saving ? 'Kaydediliyor…' : 'Bursu tanımla'}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
