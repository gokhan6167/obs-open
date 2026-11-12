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
  Segmented,
  Drawer,
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

interface Company {
  id: string;
  name: string;
  sector: string | null;
  contact: string | null;
  protocolNo: string | null;
  scholarshipRateBps: number | null;
  active: boolean;
  placementCount: number;
  createdAt: string;
}

interface MyPlacement {
  id: string;
  companyId: string;
  companyName: string;
  companySector: string | null;
  term: string | null;
  status: string;
  note: string | null;
  createdAt: string;
}

type Tab = 'basvurularim' | 'firmalar';

const STATUS_TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  short_list: 'Kısa liste',
  kabul: 'Kabul',
  devam: 'Devam ediyor',
  tamamlandi: 'Tamamlandı',
  red: 'Reddedildi',
};
const statusLabel = (s: string): string => STATUS_TR[s] ?? s;

function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (s === 'tamamlandi') return 'ok';
  if (s === 'red') return 'danger';
  if (s === 'kabul' || s === 'devam') return 'info';
  if (s === 'short_list') return 'warn';
  return 'muted';
}

/** bps -> yüzde metni (1050 -> "%10,5"). */
const bpsToPct = (bps: number | null | undefined): string =>
  bps == null || bps === 0
    ? '—'
    : '%' + (bps / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

export default function OgrenciCoop(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('basvurularim');

  const [mine, setMine] = useState<MyPlacement[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Başvuru sürgüsü.
  const [sel, setSel] = useState<Company | null>(null);
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    const [placements, comp] = await Promise.all([
      api<MyPlacement[]>('/coop/placements/my'),
      api<{ items: Company[] }>('/coop/companies'),
    ]);
    setMine(placements ?? []);
    setCompanies(comp.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'CO-OP bilgileri yüklenemedi'))
      .finally(() => setLoading(false));
  }, [load]);

  /** Reddedilmemiş başvurusu olan firmalar — tekrar başvuru gösterilmez. */
  const appliedIds = useMemo(
    () => new Set(mine.filter((p) => p.status !== 'red').map((p) => p.companyId)),
    [mine],
  );

  const stats = useMemo(
    () => ({
      total: mine.length,
      active: mine.filter((p) => p.status === 'kabul' || p.status === 'devam').length,
      done: mine.filter((p) => p.status === 'tamamlandi').length,
      companies: companies.length,
    }),
    [mine, companies],
  );

  function openApply(c: Company): void {
    setSel(c);
    setTerm('');
    setFormErr('');
  }

  async function submitApply(): Promise<void> {
    if (!sel) return;
    setBusy(true);
    setFormErr('');
    try {
      await api('/coop/placements', {
        method: 'POST',
        body: { companyId: sel.id, ...(term.trim() ? { term: term.trim() } : {}) },
      });
      toast('Başvurunuz alındı', {
        tone: 'ok',
        body: `${sel.name}${term.trim() ? ` · ${term.trim()}` : ''}`,
      });
      setSel(null);
      await load();
      setTab('basvurularim');
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Başvuru başarısız';
      setFormErr(m);
      toast('Başvuru başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="CO-OP Başvurum"
        sub="Protokollü firmalara CO-OP başvurusu yapın, başvurularınızın durumunu takip edin."
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Başvurum', value: stats.total, icon: 'fileText' },
            { label: 'Aktif yerleştirme', value: stats.active, icon: 'activity', tone: 'ok' },
            { label: 'Tamamlanan', value: stats.done, icon: 'checkCircle' },
            { label: 'Açık firma', value: stats.companies, icon: 'building' },
          ]}
        />
      )}

      <div className="row" style={{ marginBottom: 14 }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'basvurularim', label: 'Başvurularım' },
            { value: 'firmalar', label: 'Firmalar' },
          ]}
        />
      </div>

      {err && <Alert tone="err">{err}</Alert>}

      {tab === 'basvurularim' ? (
        <Card title="Başvurularım" icon="fileText">
          {loading ? (
            <Skeleton lines={6} />
          ) : (
            <DataTable<MyPlacement>
              rows={mine}
              search
              csv
              csvName="coop-basvurularim"
              empty={
                <EmptyState
                  icon="building"
                  title="Henüz CO-OP başvurunuz yok"
                  sub="Firmalar sekmesinden protokollü bir firmaya başvurabilirsiniz."
                  action={
                    <Button icon="arrowRight" onClick={() => setTab('firmalar')}>
                      Firmaları gör
                    </Button>
                  }
                />
              }
              columns={[
                {
                  key: 'companyName',
                  header: 'Firma',
                  sortable: true,
                  value: (r) => r.companyName,
                  render: (r) => (
                    <>
                      <b>{r.companyName}</b>
                      {r.companySector && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {r.companySector}
                        </div>
                      )}
                    </>
                  ),
                },
                {
                  key: 'term',
                  header: 'Dönem',
                  sortable: true,
                  value: (r) => r.term ?? '',
                  render: (r) => r.term ?? <span className="muted">—</span>,
                },
                {
                  key: 'status',
                  header: 'Durum',
                  sortable: true,
                  value: (r) => statusLabel(r.status),
                  render: (r) => <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>,
                },
                {
                  key: 'createdAt',
                  header: 'Başvuru',
                  sortable: true,
                  value: (r) => r.createdAt,
                  render: (r) => fmtDate(r.createdAt),
                },
                {
                  key: 'note',
                  header: 'Açıklama',
                  value: (r) => r.note ?? '',
                  render: (r) => r.note ?? <span className="muted">—</span>,
                },
              ]}
            />
          )}
        </Card>
      ) : (
        <Card title="CO-OP firmaları" icon="building" hint="Burs oranı firma protokolünde tanımlıdır.">
          {loading ? (
            <Skeleton lines={6} />
          ) : (
            <DataTable<Company>
              rows={companies}
              search
              csv
              csvName="coop-firmalar"
              empty={
                <EmptyState
                  icon="building"
                  title="Açık firma bulunmuyor"
                  sub="Kariyer merkezi yeni protokol tanımladığında firmalar burada listelenir."
                />
              }
              columns={[
                {
                  key: 'name',
                  header: 'Firma',
                  sortable: true,
                  value: (r) => r.name,
                  render: (r) => (
                    <>
                      <b>{r.name}</b>
                      {r.protocolNo && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Protokol: {r.protocolNo}
                        </div>
                      )}
                    </>
                  ),
                },
                {
                  key: 'sector',
                  header: 'Sektör',
                  sortable: true,
                  value: (r) => r.sector ?? '',
                  render: (r) => r.sector ?? <span className="muted">—</span>,
                },
                {
                  key: 'scholarshipRateBps',
                  header: 'Burs Oranı',
                  sortable: true,
                  num: true,
                  value: (r) => r.scholarshipRateBps ?? 0,
                  render: (r) => bpsToPct(r.scholarshipRateBps),
                },
                {
                  key: 'action',
                  header: 'İşlem',
                  render: (r) =>
                    appliedIds.has(r.id) ? (
                      <Badge tone="info">Başvuruldu</Badge>
                    ) : (
                      <Button variant="ghost" sm icon="arrowRight" onClick={() => openApply(r)}>
                        Başvur
                      </Button>
                    ),
                },
              ]}
            />
          )}
        </Card>
      )}

      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel ? `CO-OP başvurusu · ${sel.name}` : undefined}
      >
        {sel && (
          <>
            {formErr && <Alert tone="err">{formErr}</Alert>}

            <div className="info-box">
              <div>
                <b>{sel.name}</b>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {sel.sector ?? 'Sektör belirtilmemiş'} · Burs oranı: {bpsToPct(sel.scholarshipRateBps)}
              </div>
              {sel.contact && (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {sel.contact}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitApply();
              }}
            >
              <div className="field">
                <label>Dönem</label>
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  maxLength={40}
                  placeholder="Örn. 2026-2027 Güz"
                />
                <span className="muted" style={{ fontSize: 12 }}>
                  Zorunlu değildir; boş bırakırsanız kariyer merkezi atar.
                </span>
              </div>

              <Button type="submit" icon="check" block disabled={busy}>
                {busy ? 'Gönderiliyor…' : 'Başvuruyu gönder'}
              </Button>
            </form>
          </>
        )}
      </Drawer>
    </>
  );
}
