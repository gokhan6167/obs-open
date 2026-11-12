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
  toast,
  money,
} from '@/app/ui';

interface FinanceSummary {
  collected: number;
  accrued: number;
  outstanding: number;
  debtorCount: number;
  invoiceCount: number;
  partialCount: number;
  paidCount: number;
  scholarshipCount: number;
  scholarshipTotal: number;
}

interface FeeSchedule {
  id: string;
  programId: string;
  programCode: string;
  programName: string;
  year: number;
  baseAmount: number;
}

interface Program {
  id: string;
  code: string;
  name: string;
  level: string;
}

interface DebtType {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

export default function HarcYonetimPage(): React.ReactElement {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [schedules, setSchedules] = useState<FeeSchedule[]>([]);
  const [debtTypes, setDebtTypes] = useState<DebtType[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Yeni borç tipi sürgüsü.
  const [dtOpen, setDtOpen] = useState(false);
  const [dtErr, setDtErr] = useState('');
  const [dtCode, setDtCode] = useState('');
  const [dtName, setDtName] = useState('');
  const [dtSaving, setDtSaving] = useState(false);

  // Yeni tutar sürgüsü.
  const [open, setOpen] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loadingProg, setLoadingProg] = useState(false);
  const [drawerErr, setDrawerErr] = useState('');
  const [programId, setProgramId] = useState('');
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [amountTl, setAmountTl] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [s, f, d] = await Promise.all([
      api<FinanceSummary>('/finance/summary'),
      api<FeeSchedule[]>('/finance/fee-schedules'),
      api<DebtType[]>('/finance/debt-types'),
    ]);
    setSummary(s);
    setSchedules(f);
    setDebtTypes(d);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const collectRate = useMemo(() => {
    if (!summary || summary.accrued <= 0) return 0;
    return Math.round((summary.collected / summary.accrued) * 100);
  }, [summary]);

  async function openDrawer(): Promise<void> {
    setOpen(true);
    setDrawerErr('');
    if (programs.length > 0) return;
    setLoadingProg(true);
    try {
      const rows = await api<Program[]>('/programs');
      setPrograms(rows);
    } catch (e) {
      setDrawerErr(e instanceof Error ? e.message : 'Programlar alınamadı');
    } finally {
      setLoadingProg(false);
    }
  }

  function closeDrawer(): void {
    setOpen(false);
    setProgramId('');
    setYear(CURRENT_YEAR);
    setAmountTl('');
    setDrawerErr('');
  }

  async function submit(): Promise<void> {
    setDrawerErr('');
    const tl = Number(amountTl.replace(',', '.'));
    if (!programId) {
      setDrawerErr('Program seçin');
      return;
    }
    if (!Number.isFinite(tl) || tl <= 0) {
      setDrawerErr('Geçerli bir tutar girin');
      return;
    }
    const baseAmount = Math.round(tl * 100);
    setSaving(true);
    try {
      await api('/finance/fee-schedules', {
        method: 'POST',
        body: { programId, year, baseAmount },
      });
      toast('Ücret tarifesi eklendi', { tone: 'ok' });
      closeDrawer();
      await load();
    } catch (e) {
      setDrawerErr(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  function openDtDrawer(): void {
    setDtOpen(true);
    setDtErr('');
  }

  function closeDtDrawer(): void {
    setDtOpen(false);
    setDtCode('');
    setDtName('');
    setDtErr('');
  }

  async function submitDt(): Promise<void> {
    setDtErr('');
    const code = dtCode.trim();
    const name = dtName.trim();
    if (!code) {
      setDtErr('Kod girin');
      return;
    }
    if (!name) {
      setDtErr('Ad girin');
      return;
    }
    setDtSaving(true);
    try {
      await api('/finance/debt-types', {
        method: 'POST',
        body: { code, name },
      });
      toast('Borç tipi eklendi', { tone: 'ok' });
      closeDtDrawer();
      await load();
    } catch (e) {
      setDtErr(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setDtSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Harç Yönetimi"
        sub="Program bazında harç tutarları ve tahsilat özeti."
        actions={
          <Button icon="edit" onClick={() => void openDrawer()}>
            Yeni tutar
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        summary && (
          <StatGrid
            stats={[
              { label: 'Tahakkuk', value: money(summary.accrued), icon: 'file' },
              {
                label: 'Tahsilat',
                value: money(summary.collected),
                icon: 'checkCircle',
                tone: 'ok',
              },
              {
                label: 'Açık alacak',
                value: money(summary.outstanding),
                icon: 'alert',
                tone: summary.outstanding > 0 ? 'warn' : undefined,
              },
              { label: 'Tahsilat oranı', value: `%${collectRate}`, icon: 'pie' },
            ]}
          />
        )
      )}

      <Card
        title="Harç tutarları"
        icon="file"
        hint={schedules.length ? `${schedules.length} tarife` : undefined}
      >
        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable<FeeSchedule>
            rows={schedules}
            search
            csv
            csvName="oidb-harc-tarifeleri"
            empty={
              <EmptyState
                icon="file"
                title="Harç tarifesi tanımlı değil"
                sub="Yeni tutar ekleyerek program bazında harç tutarı belirleyin."
              />
            }
            columns={[
              {
                key: 'programCode',
                header: 'Program kodu',
                sortable: true,
                value: (r) => r.programCode,
                render: (r) => <b>{r.programCode}</b>,
              },
              {
                key: 'programName',
                header: 'Program',
                sortable: true,
                value: (r) => r.programName,
              },
              {
                key: 'year',
                header: 'Yıl',
                sortable: true,
                num: true,
                value: (r) => r.year,
                render: (r) => <Badge tone="muted">{r.year}</Badge>,
              },
              {
                key: 'baseAmount',
                header: 'Harç tutarı',
                sortable: true,
                num: true,
                value: (r) => r.baseAmount,
                render: (r) => <b>{money(r.baseAmount)}</b>,
              },
            ]}
          />
        )}
      </Card>

      <Card
        title="Borç tipleri"
        icon="wallet"
        hint={debtTypes.length ? `${debtTypes.length} tip` : undefined}
        actions={
          <Button variant="ghost" icon="edit" onClick={openDtDrawer}>
            Yeni borç tipi
          </Button>
        }
      >
        {loading ? (
          <Skeleton lines={5} />
        ) : (
          <DataTable<DebtType>
            rows={debtTypes}
            search
            csv
            csvName="oidb-borc-tipleri"
            empty={
              <EmptyState
                icon="wallet"
                title="Borç tipi tanımlı değil"
                sub="Harç, materyal, sınav ücreti gibi borç tiplerini tanımlayın."
              />
            }
            columns={[
              {
                key: 'code',
                header: 'Kod',
                sortable: true,
                value: (r) => r.code,
                render: (r) => <b>{r.code}</b>,
              },
              {
                key: 'name',
                header: 'Ad',
                sortable: true,
                value: (r) => r.name,
              },
              {
                key: 'active',
                header: 'Durum',
                sortable: true,
                value: (r) => (r.active ? 1 : 0),
                render: (r) => (
                  <Badge tone={r.active ? 'ok' : 'muted'}>
                    {r.active ? 'Aktif' : 'Pasif'}
                  </Badge>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer open={dtOpen} onClose={closeDtDrawer} title="Yeni borç tipi">
        {dtErr && <Alert tone="err">{dtErr}</Alert>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitDt();
          }}
        >
          <div className="field">
            <label>Kod</label>
            <input
              type="text"
              value={dtCode}
              onChange={(e) => setDtCode(e.target.value)}
              placeholder="Örn. HARC"
            />
          </div>

          <div className="field">
            <label>Ad</label>
            <input
              type="text"
              value={dtName}
              onChange={(e) => setDtName(e.target.value)}
              placeholder="Örn. Harç / Materyal / Sınav Ücreti / Uzaktan Eğitim"
            />
          </div>

          <Button type="submit" icon="check" block disabled={dtSaving}>
            {dtSaving ? 'Kaydediliyor…' : 'Borç tipini kaydet'}
          </Button>
        </form>
      </Drawer>

      <Drawer open={open} onClose={closeDrawer} title="Yeni harç tutarı">
        {drawerErr && <Alert tone="err">{drawerErr}</Alert>}

        {loadingProg ? (
          <Skeleton lines={5} />
        ) : programs.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="Program bulunamadı"
            sub="Önce müfredat programları tanımlanmalı."
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="field">
              <label>Program</label>
              <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">Program seçin…</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Yıl</label>
              <input
                type="number"
                value={year}
                min={2000}
                max={2100}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <label>Harç tutarı (₺)</label>
              <input
                type="text"
                inputMode="decimal"
                value={amountTl}
                onChange={(e) => setAmountTl(e.target.value)}
                placeholder="Örn. 3500,00"
              />
            </div>

            <Button type="submit" icon="check" block disabled={saving}>
              {saving ? 'Kaydediliyor…' : 'Tutarı kaydet'}
            </Button>
          </form>
        )}
      </Drawer>
    </>
  );
}
