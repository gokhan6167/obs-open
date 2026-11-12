'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert,
  EmptyState, Skeleton, SkeletonStats, toast, fmtDate,
} from '@/app/ui';

interface Me {
  student?: { id: string };
}
interface Req {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  decisionReason: string | null;
  createdAt: string;
}

// İstenen belge türleri (payload.belge içinde tutulur; talep türü sabit "belge").
const BELGE_TURLERI = [
  'Öğrenci Belgesi',
  'Transkript',
  'Askerlik',
  'Disiplin Durum',
  'Kayıt Dondurma',
];

const STATUS_TR: Record<string, string> = {
  submitted: 'Başvuruldu',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};
const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  submitted: 'warn',
  in_review: 'warn',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'muted',
};

// Bir talebin hangi belgeye ait olduğunu payload'dan okur.
function belgeAdi(r: Req): string {
  const b = r.payload?.belge;
  return typeof b === 'string' && b ? b : 'Belge';
}
function belgeNot(r: Req): string {
  const n = r.payload?.aciklama;
  return typeof n === 'string' ? n : '';
}

export default function BelgeTalep(): React.ReactElement {
  const [studentId, setStudentId] = useState('');
  const [reqs, setReqs] = useState<Req[]>([]);
  const [belge, setBelge] = useState(BELGE_TURLERI[0]);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadReqs = useCallback(async () => setReqs(await api<Req[]>('/portal/requests')), []);

  useEffect(() => {
    (async () => {
      const m = await api<Me>('/portal/me');
      setStudentId(m.student?.id ?? '');
      await loadReqs();
    })()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [loadReqs]);

  // Yalnızca belge talepleri (bu ekran belge türüne odaklı).
  const belgeReqs = useMemo(() => reqs.filter((r) => r.type === 'belge'), [reqs]);
  const pending = useMemo(
    () => belgeReqs.filter((r) => r.status === 'submitted' || r.status === 'in_review').length,
    [belgeReqs],
  );

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!studentId) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await api('/requests', {
        method: 'POST',
        body: {
          studentId,
          type: 'belge',
          payload: { belge, ...(note ? { aciklama: note } : {}) },
        },
      });
      setMsg(`${belge} talebiniz alındı; ilgili birimin onayına düştü.`);
      setNote('');
      await loadReqs();
      toast('Belge talebi alındı', { tone: 'ok', body: `${belge} başvurunuz ilgili birime iletildi.` });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Talep oluşturulamadı';
      setErr(m);
      toast('Talep oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Belge Talebi"
        sub="Resmî belge başvurusu oluştur ve durumunu takip et."
      />

      {loading ? (
        <>
          <SkeletonStats n={3} />
          <Skeleton lines={4} />
        </>
      ) : (
        <>
          {belgeReqs.length > 0 && (
            <StatGrid
              stats={[
                { label: 'Toplam talep', value: belgeReqs.length, icon: 'fileText' },
                { label: 'Beklemede', value: pending, icon: 'clock', tone: pending > 0 ? 'warn' : undefined },
                { label: 'Onaylanan', value: belgeReqs.filter((r) => r.status === 'approved').length, icon: 'checkCircle', tone: 'ok' },
              ]}
            />
          )}

          <Card icon="edit" title="Yeni Belge Talebi">
            {msg && <Alert tone="ok">{msg}</Alert>}
            {err && <Alert tone="err">{err}</Alert>}
            <form onSubmit={submit}>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: '1 1 220px', marginBottom: 0 }}>
                  <label>Belge türü</label>
                  <select value={belge} onChange={(e) => setBelge(e.target.value)}>
                    {BELGE_TURLERI.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: '3 1 300px', marginBottom: 0 }}>
                  <label>Açıklama (isteğe bağlı)</label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Gerekçe / detay"
                  />
                </div>
                <Button type="submit" icon="arrowRight" disabled={busy || !studentId}>
                  {busy ? 'Gönderiliyor…' : 'Başvur'}
                </Button>
              </div>
            </form>
          </Card>

          <Card icon="fileText" title="Belge Taleplerim">
            {belgeReqs.length === 0 ? (
              <EmptyState
                icon="fileText"
                title="Henüz belge talebi yok"
                sub="Yukarıdaki formdan öğrenci belgesi, transkript veya diğer belgeler için başvuru oluşturabilirsiniz."
              />
            ) : (
              <DataTable
                rows={belgeReqs}
                csv
                csvName="belge-taleplerim"
                empty="Kayıt bulunamadı."
                columns={[
                  { key: 'belge', header: 'Belge', value: (r) => belgeAdi(r), render: (r) => <b>{belgeAdi(r)}</b> },
                  { key: 'createdAt', header: 'Tarih', value: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
                  {
                    key: 'status', header: 'Durum', value: (r) => STATUS_TR[r.status] ?? r.status,
                    render: (r) => <Badge tone={BADGE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>,
                  },
                  {
                    key: 'reason', header: 'Not / Karar', sortable: false,
                    value: (r) => r.decisionReason ?? belgeNot(r),
                    render: (r) => <span className="muted">{r.decisionReason ?? (belgeNot(r) || '—')}</span>,
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
