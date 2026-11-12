'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert,
  EmptyState, Skeleton, SkeletonStats, toast, money, fmtDate,
} from '@/app/ui';

interface ReqDetail {
  iban?: string;
  accountHolder?: string;
  bank?: string;
  amount?: number;
}
interface Req {
  id: string;
  kind: string;
  reason: string | null;
  detail: ReqDetail | null;
  status: string;
  decisionNote: string | null;
  createdAt: string;
}

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
  iptal: 'danger',
};

// IBAN'ı 4'erli gruplayarak okunur biçimde göster.
function ibanFmt(iban: string | undefined): string {
  if (!iban) return '—';
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

// TL girdisini kuruşa çevir ("1.250,50" veya "1250.5" kabul).
function toKurus(input: string): number {
  const norm = input.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  if (!isFinite(n) || n <= 0) return NaN;
  return Math.round(n * 100);
}

export default function UcretIadesi(): React.ReactElement {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [iban, setIban] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [bank, setBank] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const rows = await api<Req[]>('/student-requests/my');
    setReqs(rows.filter((r) => r.kind === 'ucret_iadesi'));
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
  const approved = useMemo(() => reqs.filter((r) => r.status === 'onaylandi').length, [reqs]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const kurus = toKurus(amount);
    if (!iban.trim() || !accountHolder.trim() || !bank.trim() || isNaN(kurus)) {
      setErr('IBAN, hesap sahibi, banka ve geçerli bir tutar giriniz.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await api('/student-requests', {
        method: 'POST',
        body: {
          kind: 'ucret_iadesi',
          reason: reason.trim() || undefined,
          detail: {
            iban: iban.replace(/\s+/g, '').toUpperCase(),
            accountHolder: accountHolder.trim(),
            bank: bank.trim(),
            amount: kurus,
          },
        },
      });
      setIban('');
      setAccountHolder('');
      setBank('');
      setAmount('');
      setReason('');
      await load();
      toast('İade talebi alındı', {
        tone: 'ok',
        body: 'Ücret iadesi talebiniz mali işlerin onayına düştü. Durum değişikliği SMS ile bildirilir.',
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
        title="Ücret İadesi Talebi"
        sub="Fazla/yersiz ödemeler için iade başvurusu oluştur ve durumunu takip et."
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
                { label: 'Onaylanan', value: approved, icon: 'checkCircle', tone: 'ok' },
              ]}
            />
          )}

          <Alert tone="info">
            Talebiniz mali işler tarafından değerlendirilir; iade, beyan ettiğiniz IBAN'a yapılır.
            Durum değişikliği SMS ile bildirilir.
          </Alert>

          <Card icon="edit" title="Yeni İade Talebi">
            {err && <Alert tone="err">{err}</Alert>}
            <form onSubmit={submit}>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: '2 1 320px', marginBottom: 0 }}>
                  <label>IBAN</label>
                  <input
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    placeholder="TR00 0000 0000 0000 0000 0000 00"
                    autoComplete="off"
                  />
                </div>
                <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                  <label>Hesap sahibi</label>
                  <input
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    placeholder="Ad Soyad"
                  />
                </div>
              </div>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                  <label>Banka</label>
                  <input
                    value={bank}
                    onChange={(e) => setBank(e.target.value)}
                    placeholder="Banka adı"
                  />
                </div>
                <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                  <label>İade tutarı (₺)</label>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
                <div className="field" style={{ flex: '2 1 260px', marginBottom: 0 }}>
                  <label>İade sebebi (isteğe bağlı)</label>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Fazla ödeme, mükerrer tahsilat vb."
                  />
                </div>
                <Button type="submit" icon="arrowRight" disabled={busy}>
                  {busy ? 'Gönderiliyor…' : 'Başvur'}
                </Button>
              </div>
            </form>
          </Card>

          <Card icon="fileText" title="İade Taleplerim">
            {reqs.length === 0 ? (
              <EmptyState
                icon="wallet"
                title="Henüz iade talebi yok"
                sub="Yukarıdaki formdan fazla veya yersiz ödemeleriniz için ücret iadesi başvurusu oluşturabilirsiniz."
              />
            ) : (
              <DataTable
                rows={reqs}
                csv
                csvName="ucret-iade-taleplerim"
                empty="Kayıt bulunamadı."
                columns={[
                  { key: 'createdAt', header: 'Tarih', value: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
                  {
                    key: 'amount', header: 'Tutar', num: true,
                    value: (r) => r.detail?.amount ?? 0,
                    render: (r) => <b>{money(r.detail?.amount)}</b>,
                  },
                  {
                    key: 'iban', header: 'IBAN',
                    value: (r) => r.detail?.iban ?? '',
                    render: (r) => <span style={{ fontFamily: 'ui-monospace, monospace' }}>{ibanFmt(r.detail?.iban)}</span>,
                  },
                  {
                    key: 'bank', header: 'Banka',
                    value: (r) => r.detail?.bank ?? '',
                    render: (r) => <span className="muted">{r.detail?.bank || '—'}</span>,
                  },
                  {
                    key: 'status', header: 'Durum', value: (r) => STATUS_TR[r.status] ?? r.status,
                    render: (r) => <Badge tone={BADGE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>,
                  },
                  {
                    key: 'note', header: 'Karar notu', sortable: false,
                    value: (r) => r.decisionNote ?? '',
                    render: (r) => <span className="muted">{r.decisionNote || '—'}</span>,
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
