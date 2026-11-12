'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert, Drawer,
  EmptyState, Skeleton, SkeletonStats, Segmented, toast, fmtDate,
  type Column,
} from '@/app/ui';

interface Appointment {
  id: string;
  kind: string;
  status: string;
  requestedAt: string | null;
  appointmentAt: string | null;
  rating: number | null;
  createdAt: string;
}

type Tab = 'liste' | 'yeni';
type Kind = 'bireysel' | 'grup' | 'atolye';

const KIND_TR: Record<string, string> = {
  bireysel: 'Bireysel görüşme',
  grup: 'Grup görüşmesi',
  atolye: 'Atölye',
};

const STATUS_TR: Record<string, string> = {
  talep: 'Talep alındı',
  planlandi: 'Planlandı',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
  gelmedi: 'Gelmedi',
};

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  talep: 'warn',
  planlandi: 'info',
  tamamlandi: 'ok',
  iptal: 'muted',
  gelmedi: 'danger',
};

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'bireysel', label: 'Bireysel' },
  { value: 'grup', label: 'Grup' },
  { value: 'atolye', label: 'Atölye' },
];

const RATING_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
];

export default function PdrRandevu(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('liste');
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Yeni talep formu
  const [kind, setKind] = useState<Kind>('bireysel');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');

  // Puanlama
  const [rateOf, setRateOf] = useState<Appointment | null>(null);
  const [rating, setRating] = useState('5');
  const [rateBusy, setRateBusy] = useState(false);
  const [rateErr, setRateErr] = useState('');

  const load = useCallback(async () => {
    const res = await api<Appointment[]>('/wellbeing/counseling/my');
    setItems(Array.isArray(res) ? res : []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Randevular yüklenemedi'))
      .finally(() => setLoading(false));
  }, [load]);

  const stats = useMemo(() => {
    const upcoming = items.filter((a) => a.status === 'talep' || a.status === 'planlandi').length;
    const done = items.filter((a) => a.status === 'tamamlandi').length;
    const unrated = items.filter((a) => a.status === 'tamamlandi' && a.rating == null).length;
    return { upcoming, done, unrated };
  }, [items]);

  async function submitRequest(): Promise<void> {
    setBusy(true);
    setFormErr('');
    try {
      const trimmed = note.trim();
      await api('/wellbeing/counseling', {
        method: 'POST',
        body: { kind, ...(trimmed ? { note: trimmed } : {}) },
      });
      toast('Talebiniz alındı', {
        tone: 'ok',
        body: `${KIND_TR[kind]} talebiniz PDR birimine iletildi.`,
      });
      setKind('bireysel');
      setNote('');
      await load();
      setTab('liste');
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Talep gönderilemedi';
      setFormErr(m);
      toast('Talep gönderilemedi', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  function openRate(a: Appointment): void {
    setRateOf(a);
    setRating(String(a.rating ?? 5));
    setRateErr('');
  }

  async function submitRate(): Promise<void> {
    if (!rateOf) return;
    setRateBusy(true);
    setRateErr('');
    try {
      await api(`/wellbeing/counseling/${rateOf.id}/rate`, {
        method: 'POST',
        body: { rating: Number(rating) },
      });
      toast('Puanınız kaydedildi', { tone: 'ok', body: 'Değerlendirmeniz için teşekkür ederiz.' });
      setRateOf(null);
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Puan kaydedilemedi';
      setRateErr(m);
      toast('Puan kaydedilemedi', { tone: 'err', body: m });
    } finally {
      setRateBusy(false);
    }
  }

  const columns: Column<Appointment>[] = [
    {
      key: 'kind',
      header: 'Tür',
      value: (r) => KIND_TR[r.kind] ?? r.kind,
      render: (r) => <strong>{KIND_TR[r.kind] ?? r.kind}</strong>,
    },
    {
      key: 'requestedAt',
      header: 'Talep Tarihi',
      value: (r) => r.requestedAt ?? r.createdAt ?? '',
      render: (r) => fmtDate(r.requestedAt ?? r.createdAt),
    },
    {
      key: 'appointmentAt',
      header: 'Randevu Tarihi',
      value: (r) => r.appointmentAt ?? '',
      render: (r) =>
        r.appointmentAt ? fmtDate(r.appointmentAt) : <span className="muted">Planlanmadı</span>,
    },
    {
      key: 'status',
      header: 'Durum',
      value: (r) => STATUS_TR[r.status] ?? r.status,
      render: (r) => (
        <Badge tone={STATUS_TONE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>
      ),
    },
    {
      key: 'rating',
      header: 'Değerlendirme',
      value: (r) => r.rating ?? 0,
      render: (r) => {
        if (r.status !== 'tamamlandi') return <span className="muted">—</span>;
        if (r.rating != null) return <Badge tone="ok" noDot>{r.rating} / 5</Badge>;
        return (
          <Button variant="subtle" sm icon="award" onClick={() => openRate(r)}>
            Puanla
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="PDR Randevu"
        sub="Psikolojik Danışmanlık ve Rehberlik birimine randevu talebi oluşturun, randevularınızı takip edin."
      />

      <Alert tone="info">Talebiniz yalnızca PDR birimi tarafından görülür.</Alert>

      <div style={{ margin: '16px 0' }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'liste', label: 'Randevularım' },
            { value: 'yeni', label: 'Yeni Talep' },
          ]}
        />
      </div>

      {tab === 'liste' ? (
        loading ? (
          <>
            <SkeletonStats n={3} />
            <Skeleton lines={5} />
          </>
        ) : err ? (
          <Alert tone="err">{err}</Alert>
        ) : items.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Henüz randevunuz yok"
            sub="PDR birimiyle görüşmek için yeni bir randevu talebi oluşturabilirsiniz."
            action={
              <Button icon="arrowRight" onClick={() => setTab('yeni')}>
                Yeni Talep Oluştur
              </Button>
            }
          />
        ) : (
          <>
            <StatGrid
              stats={[
                { label: 'Bekleyen / Planlı', value: stats.upcoming, icon: 'clock', tone: stats.upcoming > 0 ? 'warn' : undefined },
                { label: 'Tamamlanan', value: stats.done, icon: 'checkCircle', tone: 'ok' },
                { label: 'Puan Bekleyen', value: stats.unrated, icon: 'award' },
              ]}
            />
            <Card icon="calendar" title="Randevularım" hint="Danışman notları gizlidir ve size gösterilmez.">
              <DataTable
                rows={items}
                columns={columns}
                csv
                csvName="pdr-randevularim"
                empty={<EmptyState icon="calendar" title="Kayıt bulunamadı" />}
              />
            </Card>
          </>
        )
      ) : (
        <Card icon="edit" title="Yeni Randevu Talebi">
          {formErr && <Alert tone="err">{formErr}</Alert>}

          <div className="field">
            <label>Görüşme türü</label>
            <Segmented<Kind> value={kind} onChange={setKind} options={KIND_OPTIONS} />
            <div className="hint-sm">{KIND_TR[kind]}</div>
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label>Açıklama (isteğe bağlı)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="Görüşmek istediğiniz konuyu kısaca yazabilirsiniz. Bu alan zorunlu değildir."
            />
            <div className="hint-sm">Talebiniz yalnızca PDR birimi tarafından görülür.</div>
          </div>

          <div className="row">
            <Button icon="arrowRight" onClick={submitRequest} disabled={busy}>
              {busy ? 'Gönderiliyor…' : 'Talebi Gönder'}
            </Button>
            <Button variant="ghost" onClick={() => setTab('liste')} disabled={busy}>
              Vazgeç
            </Button>
          </div>
        </Card>
      )}

      <Drawer open={rateOf != null} onClose={() => setRateOf(null)} title="Randevuyu Puanla">
        {rateOf && (
          <div>
            <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
              {KIND_TR[rateOf.kind] ?? rateOf.kind} · {fmtDate(rateOf.appointmentAt ?? rateOf.requestedAt ?? rateOf.createdAt)}
            </p>

            {rateErr && <Alert tone="err">{rateErr}</Alert>}

            <div className="field" style={{ marginBottom: 20 }}>
              <label>Görüşme değerlendirmeniz (1 en düşük, 5 en yüksek)</label>
              <Segmented value={rating} onChange={setRating} options={RATING_OPTIONS} />
            </div>

            <Button icon="check" block onClick={submitRate} disabled={rateBusy}>
              {rateBusy ? 'Kaydediliyor…' : 'Puanı Kaydet'}
            </Button>
          </div>
        )}
      </Drawer>
    </>
  );
}
