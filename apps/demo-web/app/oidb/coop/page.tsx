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

interface Placement {
  id: string;
  companyId: string;
  companyName: string;
  companySector: string | null;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  term: string | null;
  status: string;
  note: string | null;
  createdAt: string;
}

type Tab = 'firmalar' | 'yerlestirmeler';
type PlacementStatus = 'short_list' | 'kabul' | 'devam' | 'tamamlandi' | 'red';

/** PATCH ile atanabilen durumlar; 'basvuruldu' öğrenci başvurusuyla oluşur. */
const STATUS: { value: PlacementStatus; label: string }[] = [
  { value: 'short_list', label: 'Kısa liste' },
  { value: 'kabul', label: 'Kabul' },
  { value: 'devam', label: 'Devam ediyor' },
  { value: 'tamamlandi', label: 'Tamamlandı' },
  { value: 'red', label: 'Reddedildi' },
];

const statusLabel = (s: string): string =>
  s === 'basvuruldu' ? 'Başvuruldu' : (STATUS.find((x) => x.value === s)?.label ?? s);

function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (s === 'tamamlandi') return 'ok';
  if (s === 'red') return 'danger';
  if (s === 'kabul' || s === 'devam') return 'info';
  if (s === 'short_list') return 'warn';
  return 'muted';
}

/** bps -> yüzde metni (1050 -> "%10,5"). */
const bpsToPct = (bps: number | null | undefined): string =>
  bps == null ? '—' : '%' + (bps / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** "10,5" / "10.5" girdisini bps'e çevirir; geçersizse null. */
function pctToBps(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  const n = Number(raw.replace(',', '.'));
  if (!isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

export default function CoopKariyer(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('firmalar');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [cErr, setCErr] = useState('');
  const [cLoading, setCLoading] = useState(true);

  const [placements, setPlacements] = useState<Placement[]>([]);
  const [pErr, setPErr] = useState('');
  const [pLoading, setPLoading] = useState(false);
  const [filter, setFilter] = useState('');

  // Yeni firma sürgüsü.
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [contact, setContact] = useState('');
  const [protocolNo, setProtocolNo] = useState('');
  const [ratePct, setRatePct] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // Yerleştirme durum sürgüsü.
  const [sel, setSel] = useState<Placement | null>(null);
  const [status, setStatus] = useState<PlacementStatus>('short_list');
  const [busy, setBusy] = useState(false);
  const [rowErr, setRowErr] = useState('');

  const loadCompanies = useCallback(async () => {
    const res = await api<{ items: Company[] }>('/coop/companies');
    setCompanies(res.items ?? []);
  }, []);

  const loadPlacements = useCallback(async (st: string) => {
    const res = await api<{ items: Placement[] }>(
      `/coop/placements${st ? `?status=${encodeURIComponent(st)}` : ''}`,
    );
    setPlacements(res.items ?? []);
  }, []);

  useEffect(() => {
    loadCompanies()
      .catch((e) => setCErr(e instanceof Error ? e.message : 'Firmalar yüklenemedi'))
      .finally(() => setCLoading(false));
  }, [loadCompanies]);

  useEffect(() => {
    if (tab !== 'yerlestirmeler') return;
    setPLoading(true);
    setPErr('');
    loadPlacements(filter)
      .catch((e) => setPErr(e instanceof Error ? e.message : 'Yerleştirmeler yüklenemedi'))
      .finally(() => setPLoading(false));
  }, [tab, filter, loadPlacements]);

  const stats = useMemo(
    () => ({
      companies: companies.length,
      protocol: companies.filter((c) => c.protocolNo).length,
      placements: companies.reduce((a, c) => a + Number(c.placementCount ?? 0), 0),
      scholarship: companies.filter((c) => (c.scholarshipRateBps ?? 0) > 0).length,
    }),
    [companies],
  );

  function closeNew(): void {
    setOpen(false);
    setName('');
    setSector('');
    setContact('');
    setProtocolNo('');
    setRatePct('');
    setFormErr('');
  }

  async function submitCompany(): Promise<void> {
    if (!name.trim()) {
      setFormErr('Firma adı zorunludur.');
      return;
    }
    const bps = pctToBps(ratePct);
    if (ratePct.trim() && bps === null) {
      setFormErr('Burs oranı 0–100 arasında bir yüzde olmalı.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api('/coop/companies', {
        method: 'POST',
        body: {
          name: name.trim(),
          ...(sector.trim() ? { sector: sector.trim() } : {}),
          ...(contact.trim() ? { contact: contact.trim() } : {}),
          ...(protocolNo.trim() ? { protocolNo: protocolNo.trim() } : {}),
          ...(bps !== null ? { scholarshipRateBps: bps } : {}),
        },
      });
      toast('Firma tanımlandı', { tone: 'ok', body: name.trim() });
      closeNew();
      await loadCompanies();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  function openRow(p: Placement): void {
    setSel(p);
    setStatus((STATUS.find((s) => s.value === p.status)?.value ?? 'short_list') as PlacementStatus);
    setRowErr('');
  }

  async function saveStatus(): Promise<void> {
    if (!sel) return;
    setBusy(true);
    setRowErr('');
    try {
      await api(`/coop/placements/${sel.id}`, { method: 'PATCH', body: { status } });
      toast('Yerleştirme durumu güncellendi', {
        tone: 'ok',
        body: `${sel.studentNo} · ${statusLabel(status)}`,
      });
      setSel(null);
      await loadPlacements(filter);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Güncelleme başarısız';
      setRowErr(m);
      toast('Güncelleme başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="CO-OP / Kariyer"
        sub="Firma protokolleri, burs oranları ve öğrenci yerleştirme kuyruğu."
        actions={
          tab === 'firmalar' ? (
            <Button icon="building" onClick={() => setOpen(true)}>
              Yeni firma
            </Button>
          ) : undefined
        }
      />

      {cLoading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Firma', value: stats.companies, icon: 'building' },
            { label: 'Protokollü firma', value: stats.protocol, icon: 'fileText' },
            { label: 'Toplam yerleştirme', value: stats.placements, icon: 'users', tone: 'ok' },
            { label: 'Burs veren firma', value: stats.scholarship, icon: 'award' },
          ]}
        />
      )}

      <div className="row" style={{ marginBottom: 14 }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'firmalar', label: 'Firmalar' },
            { value: 'yerlestirmeler', label: 'Yerleştirmeler' },
          ]}
        />
      </div>

      {tab === 'firmalar' ? (
        <Card title="CO-OP firmaları" icon="building">
          {cErr && <Alert tone="err">{cErr}</Alert>}
          {cLoading ? (
            <Skeleton lines={8} />
          ) : (
            <DataTable<Company>
              rows={companies}
              search
              csv
              csvName="oidb-coop-firmalar"
              empty={
                <EmptyState
                  icon="building"
                  title="Firma kaydı yok"
                  sub="Sağ üstten yeni CO-OP firması/protokolü tanımlayabilirsiniz."
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
                      {r.contact && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {r.contact}
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
                  key: 'protocolNo',
                  header: 'Protokol No',
                  sortable: true,
                  value: (r) => r.protocolNo ?? '',
                  render: (r) =>
                    r.protocolNo ? (
                      <Badge tone="info">{r.protocolNo}</Badge>
                    ) : (
                      <span className="muted">—</span>
                    ),
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
                  key: 'placementCount',
                  header: 'Yerleştirme',
                  sortable: true,
                  num: true,
                  value: (r) => Number(r.placementCount ?? 0),
                  render: (r) => Number(r.placementCount ?? 0),
                },
                {
                  key: 'createdAt',
                  header: 'Kayıt',
                  sortable: true,
                  value: (r) => r.createdAt,
                  render: (r) => fmtDate(r.createdAt),
                },
              ]}
            />
          )}
        </Card>
      ) : (
        <Card
          title="Yerleştirmeler"
          icon="users"
          actions={
            <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Durum filtresi"
              >
                <option value="">Tüm durumlar</option>
                <option value="basvuruldu">Başvuruldu</option>
                {STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {pErr && <Alert tone="err">{pErr}</Alert>}
          {pLoading ? (
            <Skeleton lines={8} />
          ) : (
            <DataTable<Placement>
              rows={placements}
              search
              csv
              csvName="oidb-coop-yerlestirmeler"
              empty={
                <EmptyState
                  icon="users"
                  title="Yerleştirme kaydı yok"
                  sub="Seçili durumda öğrenci başvurusu bulunmuyor."
                />
              }
              columns={[
                {
                  key: 'studentNo',
                  header: 'Öğrenci',
                  sortable: true,
                  value: (r) => r.studentNo,
                  render: (r) => (
                    <>
                      <b>{r.studentNo}</b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.studentEmail}
                      </div>
                    </>
                  ),
                },
                {
                  key: 'companyName',
                  header: 'Firma',
                  sortable: true,
                  value: (r) => r.companyName,
                  render: (r) => (
                    <>
                      {r.companyName}
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
                  key: 'action',
                  header: 'İşlem',
                  render: (r) => (
                    <Button variant="ghost" sm icon="edit" onClick={() => openRow(r)}>
                      Durum
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Card>
      )}

      {/* Yeni firma */}
      <Drawer open={open} onClose={closeNew} title="Yeni CO-OP firması">
        {formErr && <Alert tone="err">{formErr}</Alert>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitCompany();
          }}
        >
          <div className="field">
            <label>Firma adı</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Aselsan A.Ş."
            />
          </div>

          <div className="field">
            <label>Sektör</label>
            <input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="Örn. Savunma sanayi"
            />
          </div>

          <div className="field">
            <label>İletişim</label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Yetkili / e-posta / telefon"
            />
          </div>

          <div className="field">
            <label>Protokol no</label>
            <input
              value={protocolNo}
              onChange={(e) => setProtocolNo(e.target.value)}
              placeholder="Örn. PRT-2026-014"
            />
          </div>

          <div className="field">
            <label>Burs oranı (%)</label>
            <input
              value={ratePct}
              onChange={(e) => setRatePct(e.target.value)}
              inputMode="decimal"
              placeholder="Örn. 25"
            />
            <span className="muted" style={{ fontSize: 12 }}>
              {pctToBps(ratePct) !== null
                ? `${bpsToPct(pctToBps(ratePct))} · ${pctToBps(ratePct)} bps`
                : 'Oran girilmedi'}
            </span>
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="check" disabled={saving || !name.trim()} block>
              {saving ? 'Kaydediliyor…' : 'Firmayı kaydet'}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Yerleştirme durumu */}
      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel ? `Yerleştirme · ${sel.studentNo}` : undefined}
      >
        {sel && (
          <>
            {rowErr && <Alert tone="err">{rowErr}</Alert>}

            <div className="info-box">
              <div>
                <b>{sel.studentNo}</b> · {sel.companyName}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {sel.term ?? 'Dönem belirtilmemiş'} · Başvuru: {fmtDate(sel.createdAt)}
              </div>
              {sel.note && (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {sel.note}
                </div>
              )}
            </div>

            <h2>Durum</h2>
            <div className="row" style={{ alignItems: 'center', gap: 10 }}>
              <Badge tone={statusTone(sel.status)}>{statusLabel(sel.status)}</Badge>
              <span className="muted" style={{ fontSize: 13 }}>
                mevcut durum
              </span>
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>Yeni durum</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as PlacementStatus)}>
                {STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              icon="check"
              block
              disabled={busy || status === sel.status}
              onClick={() => void saveStatus()}
            >
              {busy ? 'Güncelleniyor…' : 'Durumu güncelle'}
            </Button>
          </>
        )}
      </Drawer>
    </>
  );
}
