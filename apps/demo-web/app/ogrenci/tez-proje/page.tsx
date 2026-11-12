'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, DataTable, Badge, Button, Alert, EmptyState,
  Skeleton, Segmented, toast, fmtDate,
} from '@/app/ui';

interface Thesis {
  id: string;
  title: string;
  advisorEmail: string | null;
  status: string;
  createdAt: string;
}
interface Advisor {
  userId: string;
  email: string;
}

const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  submitted: 'warn',
  in_review: 'info',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'danger',
};
const TR: Record<string, string> = {
  submitted: 'Başvuruldu',
  in_review: 'İncelemede',
  approved: 'Kabul',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};

const TABS: { value: 'list' | 'new'; label: string }[] = [
  { value: 'list', label: 'Başvurularım' },
  { value: 'new', label: 'Yeni Başvuru' },
];

export default function TezProje(): React.ReactElement {
  const [tab, setTab] = useState<'list' | 'new'>('list');
  const [rows, setRows] = useState<Thesis[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [advisorUserId, setAdvisorUserId] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => setRows(await api<Thesis[]>('/thesis/my')), []);

  useEffect(() => {
    Promise.all([
      api<Thesis[]>('/thesis/my'),
      api<{ items: Advisor[] } | Advisor[]>('/students/advisors'),
    ])
      .then(([t, adv]) => {
        setRows(t);
        setAdvisors(Array.isArray(adv) ? adv : adv.items);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, []);

  function reapply(t: Thesis): void {
    setTitle(t.title);
    setSummary('');
    setTab('new');
    setMsg('');
    setErr('');
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim() || !summary.trim()) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await api('/thesis', {
        method: 'POST',
        body: { title: title.trim(), summary: summary.trim(), advisorUserId: advisorUserId || undefined },
      });
      setMsg('Tez/proje konusu başvurunuz alındı.');
      setTitle('');
      setSummary('');
      setAdvisorUserId('');
      await loadList();
      setTab('list');
      toast('Başvuru alındı', { tone: 'ok', body: 'Tez/proje konusu başvurunuz danışman onayına iletildi.' });
    } catch (e2) {
      const m = e2 instanceof Error ? e2.message : 'Başvuru başarısız';
      setErr(m);
      toast('Başvuru başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Tez / Proje Konusu"
        sub="Tez veya proje konusu başvurusu oluştur ve durumunu takip et. Reddedilen başvurular için yeniden başvurabilirsin."
      />

      <div style={{ marginBottom: 16 }}>
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </div>

      {tab === 'list' ? (
        <Card icon="fileText" title="Başvurularım" className="reveal">
          {loading ? (
            <Skeleton lines={4} />
          ) : err ? (
            <Alert tone="err">{err}</Alert>
          ) : rows.length === 0 ? (
            <EmptyState
              icon="fileText"
              title="Henüz başvuru yok"
              sub="Yeni Başvuru sekmesinden tez/proje konusu başvurusu oluşturabilirsiniz."
            />
          ) : (
            <DataTable
              rows={rows}
              csv
              csvName="tez-proje-basvurulari"
              empty="Kayıt bulunamadı."
              columns={[
                { key: 'title', header: 'Başlık', value: (t) => t.title },
                { key: 'advisor', header: 'Danışman', value: (t) => t.advisorEmail ?? '', render: (t) => <span className="muted">{t.advisorEmail ?? '—'}</span> },
                { key: 'createdAt', header: 'Tarih', value: (t) => t.createdAt, render: (t) => fmtDate(t.createdAt) },
                {
                  key: 'status', header: 'Durum', value: (t) => TR[t.status] ?? t.status,
                  render: (t) => <Badge tone={BADGE[t.status] ?? 'muted'}>{TR[t.status] ?? t.status}</Badge>,
                },
                {
                  key: 'action', header: '', sortable: false, value: () => '',
                  render: (t) => t.status === 'rejected'
                    ? <Button icon="arrowRight" onClick={() => reapply(t)}>Yeniden Başvur</Button>
                    : <span className="muted">—</span>,
                },
              ]}
            />
          )}
        </Card>
      ) : (
        <Card icon="edit" title="Yeni Başvuru" className="reveal">
          {msg && <Alert tone="ok">{msg}</Alert>}
          {err && <Alert tone="err">{err}</Alert>}
          <form onSubmit={submit}>
            <div className="field">
              <label>Başlık *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Tez/proje başlığı"
                required
              />
            </div>
            <div className="field">
              <label>Özet *</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={5}
                placeholder="Konunun kısa özeti, kapsamı ve amacı"
                required
              />
            </div>
            <div className="field">
              <label>Danışman</label>
              <select value={advisorUserId} onChange={(e) => setAdvisorUserId(e.target.value)}>
                <option value="">Seçiniz…</option>
                {advisors.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.email}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" icon="arrowRight" disabled={busy || !title.trim() || !summary.trim()}>
              {busy ? 'Gönderiliyor…' : 'Başvur'}
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
