'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert, EmptyState,
  Skeleton, SkeletonStats, toast, fmtDate,
} from '@/app/ui';

interface Me {
  email?: string | null;
  phone?: string | null;
  student?: { studentNo?: string; programName?: string } | null;
  studentNo?: string | null;
  programName?: string | null;
}
interface Req {
  id: string;
  kind: string;
  reason: string | null;
  detail: Record<string, unknown> | null;
  status: string;
  decisionNote: string | null;
  createdAt: string;
}

const KIND = 'ilisik_kesme';

// İlişik kesme gerekçeleri (reason alanına yazılır).
const SEBEPLER = [
  'Mezuniyet',
  'Kendi isteğiyle kayıt sildirme',
  'Yatay geçiş',
  'Başka kuruma nakil',
  'Diğer',
];

const STATUS_TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  incelemede: 'İncelemede',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi',
  iptal: 'İptal',
};
const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  basvuruldu: 'warn',
  incelemede: 'info',
  onaylandi: 'ok',
  reddedildi: 'danger',
  iptal: 'muted',
};

function aciklamaOf(r: Req): string {
  const a = r.detail?.aciklama;
  return typeof a === 'string' ? a : '';
}

export default function IlisikKesme(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [reason, setReason] = useState(SEBEPLER[0]);
  const [aciklama, setAciklama] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadReqs = useCallback(async () => {
    const all = await api<Req[]>('/student-requests/my');
    setReqs(all.filter((r) => r.kind === KIND));
  }, []);

  useEffect(() => {
    (async () => {
      setMe(await api<Me>('/portal/me'));
      await loadReqs();
    })()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [loadReqs]);

  const studentNo = me?.student?.studentNo ?? me?.studentNo ?? '—';
  const programName = me?.student?.programName ?? me?.programName ?? '—';
  const email = me?.email ?? '—';
  const phone = me?.phone ?? '—';

  const pending = useMemo(
    () => reqs.filter((r) => r.status === 'basvuruldu' || r.status === 'incelemede').length,
    [reqs],
  );
  const hasOpen = pending > 0;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await api('/student-requests', {
        method: 'POST',
        body: {
          kind: KIND,
          reason,
          detail: { aciklama },
        },
      });
      setMsg('İlişik kesme talebiniz alındı; kütüphane ve mali borç kontrolü sonrası sonuçlanacaktır.');
      setAciklama('');
      await loadReqs();
      toast('İlişik kesme talebi alındı', {
        tone: 'ok',
        body: 'Kütüphane ve mali işler onayı bekleniyor.',
      });
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
        title="İlişik Kesme Talebi"
        sub="Üniversiteyle ilişiğinizi kesmek için başvuru oluşturun ve durumunu takip edin."
      />

      {loading ? (
        <>
          <SkeletonStats n={3} />
          <Skeleton lines={5} />
        </>
      ) : (
        <>
          {reqs.length > 0 && (
            <StatGrid
              stats={[
                { label: 'Toplam talep', value: reqs.length, icon: 'fileText' },
                { label: 'Beklemede', value: pending, icon: 'clock', tone: pending > 0 ? 'warn' : undefined },
                { label: 'Onaylanan', value: reqs.filter((r) => r.status === 'onaylandi').length, icon: 'checkCircle', tone: 'ok' },
              ]}
            />
          )}

          <Alert tone="warn">
            İlişik kesme onayı verilmeden önce kütüphane iadeleri ve mali borç durumunuz kontrol
            edilir. Açık borç veya iade edilmemiş materyal varsa talebiniz sonuçlandırılamaz.
          </Alert>

          <Card icon="user" title="İletişim Önizleme">
            <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Öğrenci No</label>
                <div><b>{studentNo}</b></div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Program</label>
                <div>{programName}</div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>E-posta</label>
                <div>{email}</div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Telefon</label>
                <div>{phone}</div>
              </div>
            </div>
            <p className="muted" style={{ margin: '12px 0 0' }}>
              Sonuç bildirimleri bu iletişim bilgileri üzerinden yapılır. Bilgileriniz güncel
              değilse özlük ekranından güncelleyin.
            </p>
          </Card>

          <Card icon="edit" title="Yeni İlişik Kesme Talebi">
            {msg && <Alert tone="ok">{msg}</Alert>}
            {err && <Alert tone="err">{err}</Alert>}
            {hasOpen && !msg && (
              <Alert tone="info">Halihazırda sonuçlanmamış bir ilişik kesme talebiniz bulunuyor.</Alert>
            )}
            <form onSubmit={submit}>
              <div className="field">
                <label>Sebep</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {SEBEPLER.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Açıklama</label>
                <textarea
                  value={aciklama}
                  onChange={(e) => setAciklama(e.target.value)}
                  maxLength={2000}
                  rows={5}
                  placeholder="Talebinizle ilgili açıklama girin"
                />
              </div>
              <Button type="submit" icon="arrowRight" disabled={busy}>
                {busy ? 'Gönderiliyor…' : 'Başvur'}
              </Button>
            </form>
          </Card>

          <Card icon="fileText" title="İlişik Kesme Taleplerim">
            {reqs.length === 0 ? (
              <EmptyState
                icon="fileText"
                title="Henüz ilişik kesme talebi yok"
                sub="Yukarıdaki formdan yeni bir ilişik kesme başvurusu oluşturabilirsiniz."
              />
            ) : (
              <DataTable
                rows={reqs}
                csv
                csvName="ilisik-kesme-taleplerim"
                empty="Kayıt bulunamadı."
                columns={[
                  { key: 'reason', header: 'Sebep', value: (r) => r.reason ?? '—', render: (r) => <b>{r.reason ?? '—'}</b> },
                  { key: 'createdAt', header: 'Tarih', value: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
                  {
                    key: 'status', header: 'Durum', value: (r) => STATUS_TR[r.status] ?? r.status,
                    render: (r) => <Badge tone={BADGE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>,
                  },
                  {
                    key: 'note', header: 'Açıklama / Karar', sortable: false,
                    value: (r) => r.decisionNote ?? aciklamaOf(r),
                    render: (r) => <span className="muted">{r.decisionNote ?? (aciklamaOf(r) || '—')}</span>,
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
