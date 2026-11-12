'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert,
  EmptyState, Skeleton, SkeletonStats, toast, fmtDate,
} from '@/app/ui';

interface Req {
  id: string;
  kind: string;
  reason: string | null;
  detail: Record<string, unknown> | null;
  status: string;
  decisionNote: string | null;
  createdAt: string;
}

const KIND = 'kayit_dondurma';

// Dönem seçenekleri (kural: güzde güz/güz+bahar, baharda sadece bahar başvurulur).
const TERMS = ['Güz', 'Bahar', 'Güz+Bahar'] as const;

// Kayıt dondurma gerekçeleri.
const REASONS = ['Sağlık', 'Ekonomik', 'Askerlik', 'Ailevi', 'Yurt dışı', 'Diğer'];

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

function term(r: Req): string {
  const t = r.detail?.term;
  return typeof t === 'string' && t ? t : '—';
}
function aciklama(r: Req): string {
  const a = r.detail?.aciklama;
  return typeof a === 'string' ? a : '';
}

export default function KayitDondurma(): React.ReactElement {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [termVal, setTermVal] = useState<string>(TERMS[0]);
  const [reason, setReason] = useState(REASONS[0]);
  const [aciklamaVal, setAciklamaVal] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const all = await api<Req[]>('/student-requests/my');
    setReqs(all.filter((r) => r.kind === KIND));
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const pending = useMemo(
    () => reqs.filter((r) => r.status === 'basvuruldu' || r.status === 'incelemede').length,
    [reqs],
  );

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
          detail: { term: termVal, ...(aciklamaVal ? { aciklama: aciklamaVal } : {}) },
        },
      });
      setMsg(`${termVal} dönemi için kayıt dondurma talebiniz alındı; ilgili birimin onayına düştü.`);
      setAciklamaVal('');
      await load();
      toast('Kayıt dondurma talebi alındı', {
        tone: 'ok',
        body: `${termVal} dönemi başvurunuz ilgili birime iletildi.`,
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
        title="Kayıt Dondurma"
        sub="Dönemlik kayıt dondurma başvurusu oluştur ve durumunu takip et."
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
                { label: 'Toplam talep', value: reqs.length, icon: 'fileText' },
                { label: 'Beklemede', value: pending, icon: 'clock', tone: pending > 0 ? 'warn' : undefined },
                { label: 'Onaylanan', value: reqs.filter((r) => r.status === 'onaylandi').length, icon: 'checkCircle', tone: 'ok' },
              ]}
            />
          )}

          <Card icon="edit" title="Yeni Kayıt Dondurma Talebi">
            <Alert tone="info">
              Güz döneminde yalnızca Güz veya Güz+Bahar; Bahar döneminde yalnızca Bahar için başvuru yapılabilir.
            </Alert>
            {msg && <Alert tone="ok">{msg}</Alert>}
            {err && <Alert tone="err">{err}</Alert>}
            <form onSubmit={submit}>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                  <label>Dönem</label>
                  <select value={termVal} onChange={(e) => setTermVal(e.target.value)}>
                    {TERMS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                  <label>Sebep</label>
                  <select value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REASONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: '2 1 260px', marginBottom: 0 }}>
                  <label>Açıklama (isteğe bağlı)</label>
                  <input
                    value={aciklamaVal}
                    onChange={(e) => setAciklamaVal(e.target.value)}
                    placeholder="Gerekçe / detay"
                  />
                </div>
                <Button type="submit" icon="arrowRight" disabled={busy}>
                  {busy ? 'Gönderiliyor…' : 'Başvur'}
                </Button>
              </div>
            </form>
          </Card>

          <Card icon="fileText" title="Kayıt Dondurma Taleplerim">
            {reqs.length === 0 ? (
              <EmptyState
                icon="fileText"
                title="Henüz kayıt dondurma talebi yok"
                sub="Yukarıdaki formdan dönem seçerek kayıt dondurma başvurusu oluşturabilirsiniz."
              />
            ) : (
              <DataTable
                rows={reqs}
                csv
                csvName="kayit-dondurma-taleplerim"
                empty="Kayıt bulunamadı."
                columns={[
                  { key: 'term', header: 'Dönem', value: (r) => term(r), render: (r) => <b>{term(r)}</b> },
                  { key: 'reason', header: 'Sebep', value: (r) => r.reason ?? '—', render: (r) => r.reason ?? '—' },
                  { key: 'createdAt', header: 'Tarih', value: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
                  {
                    key: 'status', header: 'Durum', value: (r) => STATUS_TR[r.status] ?? r.status,
                    render: (r) => <Badge tone={BADGE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>,
                  },
                  {
                    key: 'note', header: 'Açıklama / Karar', sortable: false,
                    value: (r) => r.decisionNote ?? aciklama(r),
                    render: (r) => <span className="muted">{r.decisionNote ?? (aciklama(r) || '—')}</span>,
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
