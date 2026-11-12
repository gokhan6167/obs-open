'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert, Segmented,
  Drawer, EmptyState, Skeleton, SkeletonStats, toast, fmtDate,
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

const TYPES: { value: string; label: string }[] = [
  { value: 'kayit_dondurma', label: 'Kayıt Dondurma' },
  { value: 'mazeret_sinavi', label: 'Mazeret Sınavı' },
  { value: 'belge', label: 'Belge Talebi' },
  { value: 'diger', label: 'Diğer' },
];
const TYPE_TR: Record<string, string> = Object.fromEntries(
  TYPES.map((t) => [t.value, t.label]),
);
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
// "Hangi masada bekliyor" — durumdan sorumlu birim.
const DESK: Record<string, string> = {
  submitted: 'Öğrenci İşleri kuyruğunda',
  in_review: 'İlgili birim incelemesinde',
  approved: 'Sonuçlandı',
  rejected: 'Sonuçlandı',
  cancelled: 'Kapatıldı',
};

export default function Talepler(): React.ReactElement {
  const [studentId, setStudentId] = useState('');
  const [reqs, setReqs] = useState<Req[]>([]);
  const [type, setType] = useState('belge');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Req | null>(null);

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
          type,
          payload: note ? { aciklama: note } : {},
        },
      });
      setMsg('Talebiniz alındı; ilgili birimin onayına düştü.');
      setNote('');
      await loadReqs();
      toast('Talep alındı', { tone: 'ok', body: `${TYPE_TR[type] ?? type} başvurunuz ilgili birime iletildi.` });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Talep oluşturulamadı';
      setErr(m);
      toast('Talep oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const pending = useMemo(
    () => reqs.filter((r) => r.status === 'submitted' || r.status === 'in_review').length,
    [reqs],
  );

  return (
    <>
      <PageHeader
        title="Taleplerim"
        sub="Başvuru oluştur ve hangi masada beklediğini takip et."
      />

      {loading ? (
        <>
          <SkeletonStats n={3} />
          <Skeleton lines={4} />
        </>
      ) : (
        <>
          {reqs.length > 0 && (
            <StatGrid
              stats={[
                { label: 'Toplam başvuru', value: reqs.length, icon: 'inbox' },
                { label: 'Beklemede', value: pending, icon: 'clock', tone: pending > 0 ? 'warn' : undefined },
                { label: 'Onaylanan', value: reqs.filter((r) => r.status === 'approved').length, icon: 'checkCircle', tone: 'ok' },
              ]}
            />
          )}

          <Card icon="edit" title="Yeni Talep" className="reveal">
            {msg && <Alert tone="ok">{msg}</Alert>}
            {err && <Alert tone="err">{err}</Alert>}
            <form onSubmit={submit}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Talep türü</label>
                <Segmented value={type} onChange={setType} options={TYPES} />
              </div>
              <div className="row" style={{ alignItems: 'flex-end' }}>
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

          <Card icon="fileText" title="Başvurularım" className="reveal">
            {reqs.length === 0 ? (
              <EmptyState
                icon="inbox"
                title="Henüz talep yok"
                sub="Yukarıdaki formdan belge, kayıt dondurma veya mazeret sınavı başvurusu oluşturabilirsiniz."
              />
            ) : (
              <DataTable
                rows={reqs}
                csv
                csvName="taleplerim"
                empty="Kayıt bulunamadı."
                columns={[
                  { key: 'type', header: 'Tür', value: (r) => TYPE_TR[r.type] ?? r.type, render: (r) => TYPE_TR[r.type] ?? r.type },
                  { key: 'createdAt', header: 'Tarih', value: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
                  {
                    key: 'status', header: 'Durum', value: (r) => STATUS_TR[r.status] ?? r.status,
                    render: (r) => <Badge tone={BADGE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>,
                  },
                  { key: 'desk', header: 'Nerede', value: (r) => DESK[r.status] ?? '—', render: (r) => <span className="muted">{DESK[r.status] ?? '—'}</span> },
                  {
                    key: 'reason', header: 'Karar / Not', sortable: false,
                    value: (r) => r.decisionReason ?? (typeof r.payload?.aciklama === 'string' ? String(r.payload.aciklama) : ''),
                    render: (r) => (
                      <span className="muted">
                        {r.decisionReason ??
                          (r.payload && typeof r.payload.aciklama === 'string' ? String(r.payload.aciklama) : '—')}
                      </span>
                    ),
                  },
                  {
                    key: 'detail', header: '', sortable: false,
                    render: (r) => <Button variant="ghost" sm icon="eye" onClick={() => setSel(r)}>Detay</Button>,
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}

      <Drawer open={sel != null} onClose={() => setSel(null)} title={sel ? (TYPE_TR[sel.type] ?? sel.type) : ''}>
        {sel && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <Badge tone={BADGE[sel.status] ?? 'muted'}>{STATUS_TR[sel.status] ?? sel.status}</Badge>
            </div>
            <div className="list-item"><span className="muted">Başvuru tarihi</span><b>{fmtDate(sel.createdAt)}</b></div>
            <div className="list-item"><span className="muted">Durum konumu</span><b>{DESK[sel.status] ?? '—'}</b></div>
            <div className="list-item" style={{ display: 'block' }}>
              <div className="muted" style={{ marginBottom: 4 }}>Açıklama</div>
              <div>{sel.payload && typeof sel.payload.aciklama === 'string' ? String(sel.payload.aciklama) : '—'}</div>
            </div>
            {sel.decisionReason && (
              <div className="list-item" style={{ display: 'block' }}>
                <div className="muted" style={{ marginBottom: 4 }}>Karar gerekçesi</div>
                <div>{sel.decisionReason}</div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
