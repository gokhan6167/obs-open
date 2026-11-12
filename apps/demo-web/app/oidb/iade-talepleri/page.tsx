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
  money,
  fmtDate,
} from '@/app/ui';

interface Refund {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string | null;
  amount: number; // kuruş
  iban: string | null;
  accountHolder: string | null;
  bank: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

type StatusFilter = 'hepsi' | 'talep' | 'onaylandi' | 'odendi' | 'reddedildi';
type Decision = 'onaylandi' | 'reddedildi' | 'odendi';

const STATUS_TR: Record<string, string> = {
  talep: 'Talep',
  onaylandi: 'Onaylandı',
  odendi: 'Ödendi',
  reddedildi: 'Reddedildi',
};

const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  talep: 'warn',
  onaylandi: 'info',
  odendi: 'ok',
  reddedildi: 'danger',
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'hepsi', label: 'Hepsi' },
  { value: 'talep', label: 'Talep' },
  { value: 'onaylandi', label: 'Onaylandı' },
  { value: 'odendi', label: 'Ödendi' },
  { value: 'reddedildi', label: 'Reddedildi' },
];

const DECISION_TOAST: Record<Decision, string> = {
  onaylandi: 'İade talebi onaylandı',
  reddedildi: 'İade talebi reddedildi',
  odendi: 'İade ödendi olarak işaretlendi',
};

export default function IadeTalepleriPage(): React.ReactElement {
  const [rows, setRows] = useState<Refund[]>([]);
  const [all, setAll] = useState<Refund[]>([]);
  const [status, setStatus] = useState<StatusFilter>('hepsi');
  const [detail, setDetail] = useState<Refund | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [drawerErr, setDrawerErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Tablo filtreli listeyi, StatGrid tüm kayıtları kullanır.
  const load = useCallback(async () => {
    const filteredReq = api<{ items: Refund[] }>(
      status === 'hepsi' ? '/billing/refunds' : `/billing/refunds?status=${status}`,
    );
    const allReq =
      status === 'hepsi'
        ? filteredReq
        : api<{ items: Refund[] }>('/billing/refunds');
    const [list, full] = await Promise.all([filteredReq, allReq]);
    setRows(list.items ?? []);
    setAll(full.items ?? []);
  }, [status]);

  useEffect(() => {
    setLoading(true);
    load()
      .then(() => setErr(''))
      .catch((e) => setErr(e instanceof Error ? e.message : 'İade talepleri yüklenemedi'))
      .finally(() => setLoading(false));
  }, [load]);

  const totals = useMemo(() => {
    const sum = (s: string): number =>
      all.filter((r) => r.status === s).reduce((acc, r) => acc + r.amount, 0);
    const count = (s: string): number => all.filter((r) => r.status === s).length;
    return {
      talep: { amount: sum('talep'), count: count('talep') },
      onaylandi: { amount: sum('onaylandi'), count: count('onaylandi') },
      odendi: { amount: sum('odendi'), count: count('odendi') },
    };
  }, [all]);

  function openDetail(r: Refund): void {
    setDetail(r);
    setDrawerErr('');
  }

  function closeDetail(): void {
    setDetail(null);
    setDrawerErr('');
  }

  async function decide(next: Decision): Promise<void> {
    if (!detail) return;
    setBusy(true);
    setDrawerErr('');
    try {
      await api(`/billing/refunds/${detail.id}`, { method: 'PATCH', body: { status: next } });
      toast(DECISION_TOAST[next], {
        tone: next === 'reddedildi' ? 'err' : 'ok',
        body: `${detail.studentNo} · ${money(detail.amount)}`,
      });
      closeDetail();
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İşlem başarısız';
      // Onaylanmadan "Ödendi" denenirse API 409 döner; nedeni açıkça anlatalım.
      const conflict = next === 'odendi' && detail.status !== 'onaylandi';
      setDrawerErr(
        conflict
          ? `Bu talep "${STATUS_TR[detail.status] ?? detail.status}" durumunda olduğu için ödendi işaretlenemez. İade ödemesi ancak onaylanmış talepler için kaydedilebilir: önce "Onayla", sonra "Ödendi" adımını uygulayın. (Sunucu: ${m})`
          : m,
      );
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const isOpen = detail ? detail.status === 'talep' : false;
  const isApproved = detail ? detail.status === 'onaylandi' : false;

  return (
    <>
      <PageHeader
        title="Ücret İade Talepleri"
        sub="Öğrenci iade taleplerini incele; onayla, reddet veya ödeme kaydını işaretle."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Talep (bekleyen)',
              value: money(totals.talep.amount),
              icon: 'inbox',
              tone: totals.talep.count > 0 ? 'warn' : undefined,
            },
            {
              label: 'Onaylanan',
              value: money(totals.onaylandi.amount),
              icon: 'checkCircle',
            },
            {
              label: 'Ödenen',
              value: money(totals.odendi.amount),
              icon: 'wallet',
              tone: 'ok',
            },
          ]}
        />
      )}

      <Card title="İade Talepleri" icon="wallet">
        {err && <Alert tone="err">{err}</Alert>}

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Durum</label>
          <Segmented value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </div>

        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable
            rows={rows}
            csv
            csvName="iade-talepleri"
            empty={
              <EmptyState
                icon="inbox"
                title="İade talebi yok"
                sub="Seçili duruma uyan ücret iade talebi bulunmuyor."
              />
            }
            columns={[
              {
                key: 'student',
                header: 'Öğrenci',
                sortable: true,
                value: (r) => `${r.studentNo} ${r.studentName ?? ''}`.trim(),
                render: (r) => (
                  <div>
                    <b>{r.studentNo}</b>
                    {r.studentName && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.studentName}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'amount',
                header: 'Tutar',
                sortable: true,
                num: true,
                value: (r) => r.amount,
                render: (r) => money(r.amount),
              },
              {
                key: 'iban',
                header: 'IBAN',
                value: (r) => r.iban ?? '',
                render: (r) =>
                  r.iban ? (
                    <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{r.iban}</span>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                key: 'bank',
                header: 'Banka',
                sortable: true,
                value: (r) => r.bank ?? '',
                render: (r) => r.bank || <span className="muted">—</span>,
              },
              {
                key: 'reason',
                header: 'Sebep',
                value: (r) => r.reason ?? '',
                render: (r) => r.reason || <span className="muted">—</span>,
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={TONE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>
                ),
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                sortable: true,
                value: (r) => r.createdAt,
                render: (r) => fmtDate(r.createdAt),
              },
              {
                key: 'actions',
                header: '',
                sortable: false,
                render: (r) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => openDetail(r)}>
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
        onClose={closeDetail}
        title={detail ? `${detail.studentNo} · ${money(detail.amount)}` : undefined}
      >
        {detail && (
          <div className="stack" style={{ gap: 16 }}>
            {drawerErr && <Alert tone="err">{drawerErr}</Alert>}

            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge tone={TONE[detail.status] ?? 'muted'}>
                {STATUS_TR[detail.status] ?? detail.status}
              </Badge>
              <span className="muted">{fmtDate(detail.createdAt)}</span>
            </div>

            <div className="field">
              <label>Öğrenci</label>
              <div>
                <b>{detail.studentNo}</b>
                {detail.studentName ? ` · ${detail.studentName}` : ''}
              </div>
            </div>

            <div className="field">
              <label>İade tutarı</label>
              <div>
                <b>{money(detail.amount)}</b>
              </div>
            </div>

            <div className="field">
              <label>IBAN</label>
              <div style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                {detail.iban || <span className="muted">—</span>}
              </div>
            </div>

            <div className="field">
              <label>Banka / Hesap sahibi</label>
              <div>
                {detail.bank || '—'}
                {detail.accountHolder ? ` · ${detail.accountHolder}` : ''}
              </div>
            </div>

            <div className="field">
              <label>Sebep</label>
              <div>{detail.reason || <span className="muted">—</span>}</div>
            </div>

            {detail.paidAt && (
              <div className="field">
                <label>Ödeme tarihi</label>
                <div>{fmtDate(detail.paidAt)}</div>
              </div>
            )}

            {isOpen && (
              <Alert tone="info">
                Ödeme kaydı iki adımlıdır: talep önce onaylanmalı, ardından &quot;Ödendi&quot;
                işaretlenebilir.
              </Alert>
            )}

            {isOpen || isApproved ? (
              <div className="row" style={{ gap: 8, marginBottom: 0, flexWrap: 'wrap' }}>
                {isOpen && (
                  <>
                    <Button
                      variant="ok"
                      icon="checkCircle"
                      disabled={busy}
                      onClick={() => decide('onaylandi')}
                    >
                      Onayla
                    </Button>
                    <Button
                      variant="danger"
                      icon="x"
                      disabled={busy}
                      onClick={() => decide('reddedildi')}
                    >
                      Reddet
                    </Button>
                  </>
                )}
                {isApproved && (
                  <Button
                    variant="primary"
                    icon="wallet"
                    disabled={busy}
                    onClick={() => decide('odendi')}
                  >
                    Ödendi
                  </Button>
                )}
              </div>
            ) : (
              <Alert tone="info">Bu talep sonuçlanmış; ek işlem yapılamaz.</Alert>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
