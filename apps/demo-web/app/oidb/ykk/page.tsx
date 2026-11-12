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

interface Session {
  id: string;
  sessionNo: string;
  date: string;
  status: string;
}

interface Decision {
  id: string;
  decisionNo: string;
  subject: string;
  result: string;
  createdAt: string;
}

function statusTone(s: string): 'ok' | 'warn' | 'muted' {
  const v = s.toLowerCase();
  if (v === 'tamamlandi' || v === 'kapali') return 'muted';
  if (v === 'planlandi' || v === 'taslak') return 'warn';
  return 'ok';
}

export default function YkkPage(): React.ReactElement {
  const [rows, setRows] = useState<Session[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Yeni toplantı sürgüsü.
  const [openNew, setOpenNew] = useState(false);
  const [sessionNo, setSessionNo] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // Toplantı detay (kararlar) sürgüsü.
  const [picked, setPicked] = useState<Session | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [decLoading, setDecLoading] = useState(false);
  const [decErr, setDecErr] = useState('');
  const [decNo, setDecNo] = useState('');
  const [decSubject, setDecSubject] = useState('');
  const [decResult, setDecResult] = useState('');
  const [decSaving, setDecSaving] = useState(false);
  const [decFormErr, setDecFormErr] = useState('');

  const load = useCallback(async () => {
    const res = await api<{ items: Session[] }>('/governance/sessions');
    setRows(res.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const stats = useMemo(() => {
    const done = rows.filter(
      (r) => r.status.toLowerCase() === 'tamamlandi' || r.status.toLowerCase() === 'kapali',
    ).length;
    return { total: rows.length, done, open: rows.length - done };
  }, [rows]);

  async function submitSession(): Promise<void> {
    if (!sessionNo.trim()) {
      setFormErr('Toplantı no zorunludur.');
      return;
    }
    if (!date) {
      setFormErr('Toplantı tarihi zorunludur.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api('/governance/sessions', {
        method: 'POST',
        body: { sessionNo: sessionNo.trim(), date },
      });
      toast('Toplantı oluşturuldu', { tone: 'ok', body: `No: ${sessionNo.trim()}` });
      closeNew();
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  function closeNew(): void {
    setOpenNew(false);
    setSessionNo('');
    setDate('');
    setFormErr('');
  }

  const loadDecisions = useCallback(async (id: string) => {
    setDecLoading(true);
    setDecErr('');
    try {
      const res = await api<{ items: Decision[] }>(`/governance/sessions/${id}/decisions`);
      setDecisions(res.items ?? []);
    } catch (e) {
      setDecErr(e instanceof Error ? e.message : 'Kararlar yüklenemedi');
    } finally {
      setDecLoading(false);
    }
  }, []);

  function openSession(s: Session): void {
    setPicked(s);
    setDecisions([]);
    setDecNo('');
    setDecSubject('');
    setDecResult('');
    setDecFormErr('');
    void loadDecisions(s.id);
  }

  function closeSession(): void {
    setPicked(null);
    setDecisions([]);
    setDecErr('');
    setDecNo('');
    setDecSubject('');
    setDecResult('');
    setDecFormErr('');
  }

  async function submitDecision(): Promise<void> {
    if (!picked) return;
    if (!decNo.trim()) {
      setDecFormErr('Karar no zorunludur.');
      return;
    }
    if (!decSubject.trim()) {
      setDecFormErr('Konu zorunludur.');
      return;
    }
    setDecSaving(true);
    setDecFormErr('');
    try {
      await api(`/governance/sessions/${picked.id}/decisions`, {
        method: 'POST',
        body: {
          decisionNo: decNo.trim(),
          subject: decSubject.trim(),
          ...(decResult.trim() ? { result: decResult.trim() } : {}),
        },
      });
      toast('Karar eklendi', { tone: 'ok', body: `Karar no: ${decNo.trim()}` });
      setDecNo('');
      setDecSubject('');
      setDecResult('');
      await loadDecisions(picked.id);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setDecFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setDecSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Yönetim Kurulu Kararları"
        sub="Yönetim kurulu toplantıları ve alınan kararlar. Toplantıyı seçerek kararlarını yönetin."
        actions={
          <Button icon="calendar" onClick={() => setOpenNew(true)}>
            Yeni toplantı
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam toplantı', value: stats.total, icon: 'calendar' },
            { label: 'Açık toplantı', value: stats.open, icon: 'clock', tone: 'warn' },
            { label: 'Tamamlanan', value: stats.done, icon: 'check' },
          ]}
        />
      )}

      <Card title="Toplantılar" icon="calendar">
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Session>
            rows={rows}
            search
            csv
            csvName="oidb-ykk-toplantilar"
            empty={
              <EmptyState
                icon="calendar"
                title="Henüz toplantı yok"
                sub="Sağ üstten yeni toplantı ekleyebilirsiniz."
              />
            }
            columns={[
              {
                key: 'sessionNo',
                header: 'Toplantı No',
                sortable: true,
                value: (r) => r.sessionNo,
                render: (r) => <b>{r.sessionNo}</b>,
              },
              {
                key: 'date',
                header: 'Tarih',
                sortable: true,
                value: (r) => r.date ?? '',
                render: (r) => (r.date ? fmtDate(r.date) : <span className="muted">—</span>),
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => r.status,
                render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
              },
              {
                key: 'actions',
                header: 'Kararlar',
                render: (r) => (
                  <Button variant="ghost" sm icon="arrowRight" onClick={() => openSession(r)}>
                    Kararlar
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer open={openNew} onClose={closeNew} title="Yeni toplantı">
        {formErr && <Alert tone="err">{formErr}</Alert>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitSession();
          }}
        >
          <div className="field">
            <label>Toplantı no</label>
            <input
              value={sessionNo}
              onChange={(e) => setSessionNo(e.target.value)}
              placeholder="YK-2025/12"
              required
            />
          </div>

          <div className="field">
            <label>Toplantı tarihi</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="calendar" disabled={saving} block>
              {saving ? 'Kaydediliyor…' : 'Toplantı oluştur'}
            </Button>
          </div>
        </form>
      </Drawer>

      <Drawer
        open={picked !== null}
        onClose={closeSession}
        title={picked ? `Kararlar · ${picked.sessionNo}` : 'Kararlar'}
      >
        {picked && (
          <div className="info-box" style={{ marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
              <span>
                <b>{picked.sessionNo}</b>
                {picked.date ? ` · ${fmtDate(picked.date)}` : ''}
              </span>
              <Badge tone={statusTone(picked.status)}>{picked.status}</Badge>
            </div>
          </div>
        )}

        <h2 style={{ marginTop: 0 }}>Alınan kararlar</h2>
        {decErr && <Alert tone="err">{decErr}</Alert>}
        {decLoading ? (
          <Skeleton lines={5} />
        ) : decisions.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="Karar yok"
            sub="Bu toplantıda henüz karar kaydı bulunmuyor."
          />
        ) : (
          <table>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id}>
                  <td>
                    <b>{d.decisionNo}</b>
                  </td>
                  <td>{d.subject}</td>
                  <td className="muted">{d.result || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>Yeni karar</h2>
        {decFormErr && <Alert tone="err">{decFormErr}</Alert>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitDecision();
          }}
        >
          <div className="field">
            <label>Karar no</label>
            <input
              value={decNo}
              onChange={(e) => setDecNo(e.target.value)}
              placeholder="2025/12-3"
              required
            />
          </div>

          <div className="field">
            <label>Konu</label>
            <input
              value={decSubject}
              onChange={(e) => setDecSubject(e.target.value)}
              placeholder="Kararın konusu"
              required
            />
          </div>

          <div className="field">
            <label>Sonuç</label>
            <input
              value={decResult}
              onChange={(e) => setDecResult(e.target.value)}
              placeholder="Kabul / ret / açıklama"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="edit" disabled={decSaving} block>
              {decSaving ? 'Kaydediliyor…' : 'Karar ekle'}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
