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
  Segmented,
  toast,
  fmtDate,
} from '@/app/ui';

interface Ticket {
  id: string;
  userId: string;
  userEmail: string;
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

const CATEGORY_TR: Record<string, string> = {
  ders: 'Ders',
  mali: 'Mali',
  belge: 'Belge',
  genel: 'Genel',
  sikayet: 'Şikayet',
};
const STATUS_TR: Record<string, string> = {
  acik: 'Açık',
  incelemede: 'İncelemede',
  cozuldu: 'Çözüldü',
  kapali: 'Kapalı',
};
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  acik: 'warn',
  incelemede: 'info',
  cozuldu: 'ok',
  kapali: 'muted',
};
const PRIORITY_TR: Record<string, string> = {
  dusuk: 'Düşük',
  normal: 'Normal',
  yuksek: 'Yüksek',
};
const PRIORITY_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  dusuk: 'muted',
  normal: 'info',
  yuksek: 'danger',
};

// Personelin atayabileceği durumlar (açık başlangıç durumu değiştirilerek ilerletilir).
const TARGET_STATUS: { value: string; label: string }[] = [
  { value: 'incelemede', label: 'İncelemede' },
  { value: 'cozuldu', label: 'Çözüldü' },
  { value: 'kapali', label: 'Kapalı' },
];

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Tümü' },
  { value: 'acik', label: 'Açık' },
  { value: 'incelemede', label: 'İncelemede' },
  { value: 'cozuldu', label: 'Çözüldü' },
  { value: 'kapali', label: 'Kapalı' },
];

export default function CozumMerkezi(): React.ReactElement {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [form, setForm] = useState<{ status: string; resolution: string; assignedUnit: string }>({
    status: 'incelemede',
    resolution: '',
    assignedUnit: '',
  });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (status: string) => {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await api<{ items: Ticket[] }>(`/support${q}`);
    setTickets(res.items);
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr('');
    load(statusFilter)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load, statusFilter]);

  function openDetail(t: Ticket): void {
    setForm({
      status: t.status === 'acik' ? 'incelemede' : t.status,
      resolution: t.resolution ?? '',
      assignedUnit: t.assignedUnit ?? '',
    });
    setErr('');
    setDetail(t);
  }

  async function save(): Promise<void> {
    if (!detail) return;
    setSaving(true);
    setErr('');
    try {
      await api(`/support/${detail.id}`, {
        method: 'PATCH',
        body: {
          status: form.status,
          resolution: form.resolution.trim() || undefined,
          assignedUnit: form.assignedUnit.trim() || undefined,
        },
      });
      toast('Talep güncellendi', {
        tone: form.status === 'cozuldu' ? 'ok' : 'info',
        body: `${detail.subject} → ${STATUS_TR[form.status] ?? form.status}`,
      });
      setDetail(null);
      await load(statusFilter);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Güncelleme başarısız';
      setErr(m);
      toast('Güncelleme başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  // İstatistikler mevcut yüklenen kuyruk üzerinden hesaplanır.
  const counts = useMemo(
    () => ({
      acik: tickets.filter((t) => t.status === 'acik').length,
      incelemede: tickets.filter((t) => t.status === 'incelemede').length,
      cozuldu: tickets.filter((t) => t.status === 'cozuldu').length,
    }),
    [tickets],
  );

  return (
    <>
      <PageHeader
        title="Çözüm Merkezi"
        sub="Öğrenci ve personel destek taleplerini inceleyin, birime yönlendirin ve çözüme kavuşturun."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Açık',
              value: counts.acik,
              icon: 'inbox',
              tone: counts.acik > 0 ? 'warn' : undefined,
            },
            { label: 'İncelemede', value: counts.incelemede, icon: 'activity' },
            { label: 'Çözüldü', value: counts.cozuldu, icon: 'checkCircle', tone: 'ok' },
          ]}
        />
      )}

      <Card title="Kuyruk" icon="inbox">
        {err && !detail && <Alert tone="err">{err}</Alert>}
        <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="field">
            <label>Durum filtresi</label>
            <Segmented value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTERS} />
          </div>
        </div>
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Ticket>
            rows={tickets}
            search
            csv
            csvName="cozum-merkezi"
            empty={
              <EmptyState
                icon="checkCircle"
                title="Bu filtreyle talep yok"
                sub="Durum filtresini 'Tümü' yaparak tüm kuyruğu görebilirsiniz."
              />
            }
            columns={[
              {
                key: 'userEmail',
                header: 'Açan',
                sortable: true,
                value: (t) => t.userEmail,
                render: (t) => <b>{t.userEmail}</b>,
              },
              {
                key: 'category',
                header: 'Kategori',
                sortable: true,
                value: (t) => CATEGORY_TR[t.category] ?? t.category,
              },
              {
                key: 'subject',
                header: 'Konu',
                sortable: true,
                value: (t) => t.subject,
              },
              {
                key: 'priority',
                header: 'Öncelik',
                sortable: true,
                value: (t) => PRIORITY_TR[t.priority] ?? t.priority,
                render: (t) => (
                  <Badge tone={PRIORITY_TONE[t.priority] ?? 'muted'}>
                    {PRIORITY_TR[t.priority] ?? t.priority}
                  </Badge>
                ),
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (t) => STATUS_TR[t.status] ?? t.status,
                render: (t) => (
                  <Badge tone={STATUS_TONE[t.status] ?? 'muted'}>
                    {STATUS_TR[t.status] ?? t.status}
                  </Badge>
                ),
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                sortable: true,
                value: (t) => t.createdAt,
                render: (t) => fmtDate(t.createdAt),
              },
              {
                key: 'action',
                header: 'İşlem',
                render: (t) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => openDetail(t)}>
                    Detay
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Talep · ${detail.subject}` : undefined}
      >
        {detail && (
          <>
            <p className="hint">
              {detail.userEmail} · {CATEGORY_TR[detail.category] ?? detail.category} ·{' '}
              {fmtDate(detail.createdAt)}
            </p>
            <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <Badge tone={STATUS_TONE[detail.status] ?? 'muted'}>
                {STATUS_TR[detail.status] ?? detail.status}
              </Badge>
              <Badge tone={PRIORITY_TONE[detail.priority] ?? 'muted'}>
                Öncelik: {PRIORITY_TR[detail.priority] ?? detail.priority}
              </Badge>
            </div>

            <h2>Talep içeriği</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{detail.body}</p>

            {err && <Alert tone="err">{err}</Alert>}

            <h2 style={{ marginTop: 16 }}>Karar</h2>
            <div className="field">
              <label>Yeni durum</label>
              <Segmented
                value={form.status}
                onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                options={TARGET_STATUS}
              />
            </div>
            <div className="field">
              <label htmlFor="assignedUnit">Yönlendirilen birim</label>
              <input
                id="assignedUnit"
                value={form.assignedUnit}
                onChange={(e) => setForm((f) => ({ ...f, assignedUnit: e.target.value }))}
                placeholder="Örn. Öğrenci İşleri Daire Başkanlığı"
                maxLength={120}
              />
            </div>
            <div className="field">
              <label htmlFor="resolution">Çözüm / açıklama</label>
              <textarea
                id="resolution"
                rows={4}
                value={form.resolution}
                onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
                placeholder="Öğrenciye görünecek çözüm notu"
                maxLength={4000}
              />
            </div>

            <div className="row" style={{ gap: 8, marginTop: 8, marginBottom: 0 }}>
              <Button variant="primary" icon="check" disabled={saving} onClick={save}>
                Kaydet
              </Button>
              <Button variant="ghost" disabled={saving} onClick={() => setDetail(null)}>
                Vazgeç
              </Button>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
