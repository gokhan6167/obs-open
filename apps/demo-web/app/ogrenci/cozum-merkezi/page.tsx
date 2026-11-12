'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert, Segmented,
  Drawer, EmptyState, Skeleton, SkeletonStats, toast, fmtDate,
} from '@/app/ui';

interface Ticket {
  id: string;
  category: string;
  subject: string;
  body: string;
  priority: string;
  assignedUnit: string | null;
  status: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

type Tab = 'liste' | 'yeni';
type Category = 'ders' | 'mali' | 'belge' | 'genel' | 'sikayet';
type Priority = 'dusuk' | 'normal' | 'yuksek';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'ders', label: 'Ders' },
  { value: 'mali', label: 'Mali' },
  { value: 'belge', label: 'Belge' },
  { value: 'genel', label: 'Genel' },
  { value: 'sikayet', label: 'Şikâyet' },
];
const CATEGORY_TR: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
);

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'dusuk', label: 'Düşük' },
  { value: 'normal', label: 'Normal' },
  { value: 'yuksek', label: 'Yüksek' },
];
const PRIORITY_TR: Record<string, string> = Object.fromEntries(
  PRIORITIES.map((p) => [p.value, p.label]),
);
const PRIORITY_BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  dusuk: 'muted',
  normal: 'info',
  yuksek: 'danger',
};

const STATUS_TR: Record<string, string> = {
  acik: 'Açık',
  incelemede: 'İncelemede',
  cozuldu: 'Çözüldü',
  kapali: 'Kapalı',
};
const STATUS_BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  acik: 'warn',
  incelemede: 'info',
  cozuldu: 'ok',
  kapali: 'muted',
};

export default function CozumMerkezi(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('liste');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [category, setCategory] = useState<Category>('genel');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Ticket | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ items: Ticket[] }>('/support/my');
    setTickets(res.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Talepler yüklenemedi'))
      .finally(() => setLoading(false));
  }, [load]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await api('/support', {
        method: 'POST',
        body: { category, subject: subject.trim(), body: body.trim(), priority },
      });
      setMsg('Talebiniz alındı; ilgili birim en kısa sürede değerlendirecek.');
      setSubject('');
      setBody('');
      setPriority('normal');
      await load();
      toast('Talep oluşturuldu', { tone: 'ok', body: `${CATEGORY_TR[category]} kategorisinde talebiniz iletildi.` });
      setTab('liste');
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Talep oluşturulamadı';
      setErr(m);
      toast('Talep oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const openCount = useMemo(
    () => tickets.filter((t) => t.status === 'acik' || t.status === 'incelemede').length,
    [tickets],
  );

  return (
    <>
      <PageHeader
        title="Çözüm Merkezi"
        sub="Ders, mali, belge veya diğer konularda destek talebi oluştur ve takip et."
      />

      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'liste', label: 'Taleplerim' },
            { value: 'yeni', label: 'Yeni Talep' },
          ]}
        />
      </div>

      {tab === 'liste' ? (
        loading ? (
          <>
            <SkeletonStats n={3} />
            <Skeleton lines={4} />
          </>
        ) : err ? (
          <Alert tone="err">{err}</Alert>
        ) : (
          <>
            {tickets.length > 0 && (
              <StatGrid
                stats={[
                  { label: 'Toplam talep', value: tickets.length, icon: 'inbox' },
                  { label: 'Açık / incelemede', value: openCount, icon: 'clock', tone: openCount > 0 ? 'warn' : undefined },
                  { label: 'Çözüldü', value: tickets.filter((t) => t.status === 'cozuldu').length, icon: 'checkCircle', tone: 'ok' },
                ]}
              />
            )}

            <Card icon="flag" title="Taleplerim">
              {tickets.length === 0 ? (
                <EmptyState
                  icon="inbox"
                  title="Henüz talep yok"
                  sub="Yeni Talep sekmesinden destek başvurusu oluşturabilirsiniz."
                  action={<Button icon="edit" onClick={() => setTab('yeni')}>Yeni Talep</Button>}
                />
              ) : (
                <DataTable
                  rows={tickets}
                  csv
                  csvName="cozum-merkezi-taleplerim"
                  empty="Kayıt bulunamadı."
                  columns={[
                    { key: 'category', header: 'Kategori', value: (t) => CATEGORY_TR[t.category] ?? t.category, render: (t) => CATEGORY_TR[t.category] ?? t.category },
                    { key: 'subject', header: 'Konu', value: (t) => t.subject, render: (t) => <b>{t.subject}</b> },
                    {
                      key: 'status', header: 'Durum', value: (t) => STATUS_TR[t.status] ?? t.status,
                      render: (t) => <Badge tone={STATUS_BADGE[t.status] ?? 'muted'}>{STATUS_TR[t.status] ?? t.status}</Badge>,
                    },
                    { key: 'createdAt', header: 'Tarih', value: (t) => t.createdAt, render: (t) => fmtDate(t.createdAt) },
                    {
                      key: 'detail', header: '', sortable: false,
                      render: (t) => <Button variant="ghost" sm icon="eye" onClick={() => setSel(t)}>Detay</Button>,
                    },
                  ]}
                />
              )}
            </Card>
          </>
        )
      ) : (
        <Card icon="edit" title="Yeni Talep">
          {msg && <Alert tone="ok">{msg}</Alert>}
          {err && <Alert tone="err">{err}</Alert>}
          <form onSubmit={submit}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Kategori</label>
              <Segmented value={category} onChange={setCategory} options={CATEGORIES} />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Öncelik</label>
              <Segmented value={priority} onChange={setPriority} options={PRIORITIES} />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Konu</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Kısa başlık"
                maxLength={200}
              />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Açıklama</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Talebinizi detaylandırın"
                rows={5}
                maxLength={4000}
              />
            </div>
            <Button type="submit" icon="arrowRight" disabled={busy || !subject.trim() || !body.trim()}>
              {busy ? 'Gönderiliyor…' : 'Talebi Gönder'}
            </Button>
          </form>
        </Card>
      )}

      <Drawer open={sel != null} onClose={() => setSel(null)} title={sel?.subject}>
        {sel && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <Badge tone={STATUS_BADGE[sel.status] ?? 'muted'}>{STATUS_TR[sel.status] ?? sel.status}</Badge>
              <Badge tone={PRIORITY_BADGE[sel.priority] ?? 'muted'}>{PRIORITY_TR[sel.priority] ?? sel.priority}</Badge>
            </div>
            <div className="list-item"><span className="muted">Kategori</span><b>{CATEGORY_TR[sel.category] ?? sel.category}</b></div>
            <div className="list-item"><span className="muted">Başvuru tarihi</span><b>{fmtDate(sel.createdAt)}</b></div>
            {sel.assignedUnit && (
              <div className="list-item"><span className="muted">İlgili birim</span><b>{sel.assignedUnit}</b></div>
            )}
            {sel.resolvedAt && (
              <div className="list-item"><span className="muted">Çözüm tarihi</span><b>{fmtDate(sel.resolvedAt)}</b></div>
            )}
            <div className="list-item" style={{ display: 'block' }}>
              <div className="muted" style={{ marginBottom: 4 }}>Talep</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{sel.body}</div>
            </div>
            {sel.resolution && (
              <div className="list-item" style={{ display: 'block' }}>
                <div className="muted" style={{ marginBottom: 4 }}>Çözüm / Yanıt</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{sel.resolution}</div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
