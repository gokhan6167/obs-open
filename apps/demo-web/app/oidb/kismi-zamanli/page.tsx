'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  SkeletonStats,
  DataTable,
  Badge,
  Button,
  Alert,
  Skeleton,
  EmptyState,
  Segmented,
  Drawer,
  toast,
  money,
  fmtDate,
} from '@/app/ui';

interface Job {
  id: string;
  title: string;
  unit: string | null;
  description: string | null;
  hourlyRate: number | null;
  quota: number | null;
  status: string;
  createdAt: string;
  applicationCount: number;
}

interface Assignment {
  id: string;
  jobId: string;
  jobTitle: string;
  hourlyRate: number | null;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  status: string;
  startedOn: string | null;
  endedOn: string | null;
  createdAt: string;
}

interface Timesheet {
  id: string;
  assignmentId: string;
  period: string;
  hours: string;
  approved: boolean;
  createdAt: string;
  hourlyRate: number | null;
  amount: number | null;
}

type Tab = 'ilanlar' | 'basvurular';
type StatusFilter = 'hepsi' | 'basvuruldu' | 'kabul' | 'devam' | 'bitti' | 'red';
type NextStatus = 'kabul' | 'devam' | 'bitti' | 'red';

const TABS: { value: Tab; label: string }[] = [
  { value: 'ilanlar', label: 'İlanlar' },
  { value: 'basvurular', label: 'Başvurular' },
];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'hepsi', label: 'Hepsi' },
  { value: 'basvuruldu', label: 'Başvuruldu' },
  { value: 'kabul', label: 'Kabul' },
  { value: 'devam', label: 'Devam' },
  { value: 'bitti', label: 'Bitti' },
  { value: 'red', label: 'Red' },
];

const JOB_STATUS_TR: Record<string, string> = { acik: 'Açık', kapali: 'Kapalı' };

const ASG_STATUS_TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  kabul: 'Kabul edildi',
  devam: 'Devam ediyor',
  bitti: 'Tamamlandı',
  red: 'Reddedildi',
};
const ASG_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  basvuruldu: 'warn',
  kabul: 'info',
  devam: 'info',
  bitti: 'ok',
  red: 'danger',
};
const NEXT_STATUS: NextStatus[] = ['kabul', 'devam', 'bitti', 'red'];

const EMPTY_JOB = { title: '', unit: '', description: '', hourlyRate: '', quota: '' };

/** "45,50" / "45.50" TL metnini kuruşa çevirir; boş veya geçersizse undefined. */
function toKurus(s: string): number | undefined {
  const t = s.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

/** İçinde bulunulan ay: puantaj dönemi için varsayılan (2026-01 biçimi). */
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const errMsg = (e: unknown, fallback: string): string =>
  e instanceof Error ? e.message : fallback;

export default function KismiZamanliPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('ilanlar');
  const [status, setStatus] = useState<StatusFilter>('hepsi');

  const [jobs, setJobs] = useState<Job[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Yeni ilan formu
  const [showNew, setShowNew] = useState(false);
  const [job, setJob] = useState(EMPTY_JOB);
  const [jobErr, setJobErr] = useState('');

  // Puantaj çekmecesi
  const [activeId, setActiveId] = useState('');
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [drawerErr, setDrawerErr] = useState('');
  const [sheetForm, setSheetForm] = useState({ period: currentPeriod(), hours: '' });

  const load = useCallback(async (s: StatusFilter) => {
    const [jobRes, asgRes] = await Promise.all([
      api<Job[]>('/part-time/jobs'),
      api<{ items: Assignment[] }>(
        s === 'hepsi' ? '/part-time/assignments' : `/part-time/assignments?status=${s}`,
      ),
    ]);
    setJobs(jobRes);
    setAssignments(asgRes.items);
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr('');
    load(status)
      .catch((e) => setErr(errMsg(e, 'Kısmi zamanlı çalışma kayıtları alınamadı')))
      .finally(() => setLoading(false));
  }, [load, status]);

  const active = useMemo(
    () => assignments.find((a) => a.id === activeId) ?? null,
    [assignments, activeId],
  );

  const jobStats = useMemo(
    () => ({
      acik: jobs.filter((j) => j.status === 'acik').length,
      kontenjan: jobs.reduce((t, j) => t + (j.quota ?? 0), 0),
      basvuru: jobs.reduce((t, j) => t + (j.applicationCount ?? 0), 0),
    }),
    [jobs],
  );

  const asgStats = useMemo(
    () => ({
      bekleyen: assignments.filter((a) => a.status === 'basvuruldu').length,
      devam: assignments.filter((a) => a.status === 'devam' || a.status === 'kabul').length,
      bitti: assignments.filter((a) => a.status === 'bitti').length,
    }),
    [assignments],
  );

  const approvedTotal = useMemo(
    () => sheets.reduce((t, s) => t + (s.approved ? (s.amount ?? 0) : 0), 0),
    [sheets],
  );

  /* ----------------------------- İlan işlemleri ----------------------------- */

  async function createJob(): Promise<void> {
    if (!job.title.trim()) {
      setJobErr('İlan başlığı zorunludur.');
      return;
    }
    const rate = toKurus(job.hourlyRate);
    if (job.hourlyRate.trim() && rate === undefined) {
      setJobErr('Saat ücreti geçerli bir tutar olmalıdır (örn. 45,50).');
      return;
    }
    const quota = job.quota.trim() ? Number(job.quota) : undefined;
    if (quota !== undefined && !Number.isInteger(quota)) {
      setJobErr('Kontenjan tam sayı olmalıdır.');
      return;
    }

    setBusy(true);
    setJobErr('');
    try {
      await api('/part-time/jobs', {
        method: 'POST',
        body: {
          title: job.title.trim(),
          ...(job.unit.trim() ? { unit: job.unit.trim() } : {}),
          ...(job.description.trim() ? { description: job.description.trim() } : {}),
          ...(rate !== undefined ? { hourlyRate: rate } : {}),
          ...(quota !== undefined ? { quota } : {}),
        },
      });
      toast('İlan oluşturuldu', { tone: 'ok', body: job.title.trim() });
      setJob(EMPTY_JOB);
      setShowNew(false);
      await load(status);
    } catch (e) {
      const m = errMsg(e, 'İlan oluşturulamadı');
      setJobErr(m);
      toast('İlan oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function toggleJob(r: Job): Promise<void> {
    const next = r.status === 'acik' ? 'kapali' : 'acik';
    setBusy(true);
    try {
      await api(`/part-time/jobs/${r.id}`, { method: 'PATCH', body: { status: next } });
      toast('İlan durumu güncellendi', {
        tone: 'ok',
        body: `${r.title} → ${JOB_STATUS_TR[next]}`,
      });
      await load(status);
    } catch (e) {
      const m = errMsg(e, 'İlan güncellenemedi');
      setErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  /* --------------------------- Başvuru işlemleri --------------------------- */

  async function setAssignmentStatus(r: Assignment, next: NextStatus): Promise<void> {
    setBusy(true);
    setDrawerErr('');
    try {
      await api(`/part-time/assignments/${r.id}`, { method: 'PATCH', body: { status: next } });
      toast('Başvuru durumu güncellendi', {
        tone: 'ok',
        body: `${r.studentNo} · ${r.jobTitle} → ${ASG_STATUS_TR[next]}`,
      });
      await load(status);
    } catch (e) {
      const m = errMsg(e, 'Başvuru güncellenemedi');
      setDrawerErr(m);
      setErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------- Puantaj işlemleri ---------------------------- */

  const loadSheets = useCallback(async (assignmentId: string) => {
    setSheetsLoading(true);
    setDrawerErr('');
    try {
      setSheets(await api<Timesheet[]>(`/part-time/assignments/${assignmentId}/timesheets`));
    } catch (e) {
      setSheets([]);
      setDrawerErr(errMsg(e, 'Puantaj kayıtları alınamadı'));
    } finally {
      setSheetsLoading(false);
    }
  }, []);

  function openRow(r: Assignment): void {
    setActiveId(r.id);
    setSheets([]);
    setSheetForm({ period: currentPeriod(), hours: '' });
    void loadSheets(r.id);
  }

  function closeDrawer(): void {
    setActiveId('');
    setSheets([]);
    setDrawerErr('');
  }

  async function addSheet(r: Assignment): Promise<void> {
    const hours = Number(sheetForm.hours.trim().replace(',', '.'));
    if (!sheetForm.period.trim()) {
      setDrawerErr('Puantaj dönemi zorunludur (örn. 2026-01).');
      return;
    }
    if (!sheetForm.hours.trim() || !Number.isFinite(hours) || hours <= 0) {
      setDrawerErr('Çalışma saati 0’dan büyük bir sayı olmalıdır.');
      return;
    }
    setBusy(true);
    setDrawerErr('');
    try {
      await api(`/part-time/assignments/${r.id}/timesheets`, {
        method: 'POST',
        body: { period: sheetForm.period.trim(), hours },
      });
      toast('Puantaj eklendi', {
        tone: 'ok',
        body: `${r.studentNo} · ${sheetForm.period.trim()} · ${hours} saat`,
      });
      setSheetForm({ period: sheetForm.period, hours: '' });
      await loadSheets(r.id);
    } catch (e) {
      const m = errMsg(e, 'Puantaj eklenemedi');
      setDrawerErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function approveSheet(r: Assignment, s: Timesheet): Promise<void> {
    setBusy(true);
    setDrawerErr('');
    try {
      const row = await api<Timesheet>(`/part-time/timesheets/${s.id}`, {
        method: 'PATCH',
        body: { approved: true },
      });
      toast('Puantaj onaylandı', {
        tone: 'ok',
        body: `${s.period} · ${Number(s.hours)} saat · ${money(row.amount)}`,
      });
      await loadSheets(r.id);
    } catch (e) {
      const m = errMsg(e, 'Puantaj onaylanamadı');
      setDrawerErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Kısmi Zamanlı Çalışma"
        sub="Birimlerin kısmi zamanlı öğrenci ilanlarını yayımlayın; başvuruları değerlendirip aylık puantajları onaylayın."
        actions={
          tab === 'ilanlar' ? (
            <Button
              icon={showNew ? 'x' : 'edit'}
              variant={showNew ? 'subtle' : 'primary'}
              onClick={() => {
                setShowNew((v) => !v);
                setJobErr('');
              }}
            >
              {showNew ? 'Vazgeç' : 'Yeni ilan'}
            </Button>
          ) : undefined
        }
      />

      <div className="field">
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </div>

      {loading ? (
        <SkeletonStats n={3} />
      ) : tab === 'ilanlar' ? (
        <StatGrid
          stats={[
            { label: 'Açık ilan', value: jobStats.acik, icon: 'building', tone: 'ok' },
            { label: 'Toplam kontenjan', value: jobStats.kontenjan, icon: 'users' },
            {
              label: 'Toplam başvuru',
              value: jobStats.basvuru,
              icon: 'inbox',
              tone: jobStats.basvuru > 0 ? 'warn' : undefined,
            },
          ]}
        />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Bekleyen başvuru',
              value: asgStats.bekleyen,
              icon: 'inbox',
              tone: asgStats.bekleyen > 0 ? 'warn' : undefined,
            },
            { label: 'Çalışan öğrenci', value: asgStats.devam, icon: 'activity' },
            { label: 'Tamamlanan', value: asgStats.bitti, icon: 'checkCircle', tone: 'ok' },
          ]}
        />
      )}

      {tab === 'ilanlar' ? (
        <>
          {showNew && (
            <Card title="Yeni kısmi zamanlı ilanı" icon="edit">
              {jobErr && <Alert tone="err">{jobErr}</Alert>}
              <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                <div className="field" style={{ flex: 2, minWidth: 220 }}>
                  <label htmlFor="pt-title">İlan başlığı</label>
                  <input
                    id="pt-title"
                    value={job.title}
                    maxLength={200}
                    placeholder="Kütüphane destek görevlisi"
                    onChange={(e) => setJob((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="field" style={{ flex: 2, minWidth: 200 }}>
                  <label htmlFor="pt-unit">Birim</label>
                  <input
                    id="pt-unit"
                    value={job.unit}
                    maxLength={160}
                    placeholder="Kütüphane ve Dokümantasyon D.B."
                    onChange={(e) => setJob((f) => ({ ...f, unit: e.target.value }))}
                  />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 140 }}>
                  <label htmlFor="pt-rate">Saat ücreti (₺)</label>
                  <input
                    id="pt-rate"
                    value={job.hourlyRate}
                    inputMode="decimal"
                    placeholder="45,50"
                    onChange={(e) => setJob((f) => ({ ...f, hourlyRate: e.target.value }))}
                  />
                  <div className="hint-sm">Brüt saatlik ücret; kuruş olarak kaydedilir.</div>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 120 }}>
                  <label htmlFor="pt-quota">Kontenjan</label>
                  <input
                    id="pt-quota"
                    value={job.quota}
                    inputMode="numeric"
                    placeholder="5"
                    onChange={(e) => setJob((f) => ({ ...f, quota: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="pt-desc">Açıklama</label>
                <textarea
                  id="pt-desc"
                  value={job.description}
                  rows={3}
                  maxLength={2000}
                  placeholder="Görev tanımı, çalışma günleri ve aranan nitelikler."
                  onChange={(e) => setJob((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Button icon="check" disabled={busy} onClick={() => void createJob()}>
                  İlanı yayımla
                </Button>
                <Button
                  variant="subtle"
                  disabled={busy}
                  onClick={() => {
                    setJob(EMPTY_JOB);
                    setShowNew(false);
                    setJobErr('');
                  }}
                >
                  Vazgeç
                </Button>
              </div>
            </Card>
          )}

          <Card title="İlanlar" icon="building">
            {err && <Alert tone="err">{err}</Alert>}
            {loading ? (
              <Skeleton lines={8} />
            ) : (
              <DataTable<Job>
                rows={jobs}
                search
                csv
                csvName="oidb-kismi-zamanli-ilanlar"
                empty={
                  <EmptyState
                    icon="building"
                    title="Henüz ilan yok"
                    sub="Kısmi zamanlı çalışma ilanı yayımlamak için sağ üstteki “Yeni ilan” düğmesini kullanın."
                    action={<Button icon="edit" onClick={() => setShowNew(true)}>Yeni ilan</Button>}
                  />
                }
                columns={[
                  {
                    key: 'title',
                    header: 'Başlık',
                    sortable: true,
                    value: (r) => r.title,
                    render: (r) => (
                      <div>
                        <b>{r.title}</b>
                        {r.description && (
                          <div className="muted" style={{ fontSize: 12 }}>
                            {r.description.length > 70
                              ? `${r.description.slice(0, 70)}…`
                              : r.description}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'unit',
                    header: 'Birim',
                    sortable: true,
                    value: (r) => r.unit ?? '—',
                    render: (r) => r.unit ?? <span className="muted">—</span>,
                  },
                  {
                    key: 'hourlyRate',
                    header: 'Saat ücreti',
                    sortable: true,
                    num: true,
                    value: (r) => r.hourlyRate ?? 0,
                    render: (r) => money(r.hourlyRate),
                  },
                  {
                    key: 'quota',
                    header: 'Kontenjan',
                    sortable: true,
                    num: true,
                    value: (r) => r.quota ?? 0,
                    render: (r) => (r.quota == null ? <span className="muted">—</span> : r.quota),
                  },
                  {
                    key: 'applicationCount',
                    header: 'Başvuru',
                    sortable: true,
                    num: true,
                    value: (r) => r.applicationCount,
                    render: (r) => (
                      <Badge tone={r.applicationCount > 0 ? 'info' : 'muted'} noDot>
                        {r.applicationCount}
                      </Badge>
                    ),
                  },
                  {
                    key: 'createdAt',
                    header: 'Yayım',
                    sortable: true,
                    value: (r) => r.createdAt,
                    render: (r) => fmtDate(r.createdAt),
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    sortable: true,
                    value: (r) => JOB_STATUS_TR[r.status] ?? r.status,
                    render: (r) => (
                      <Badge tone={r.status === 'acik' ? 'ok' : 'muted'}>
                        {JOB_STATUS_TR[r.status] ?? r.status}
                      </Badge>
                    ),
                  },
                  {
                    key: 'action',
                    header: 'İşlem',
                    sortable: false,
                    value: () => '',
                    render: (r) => (
                      <Button
                        variant={r.status === 'acik' ? 'subtle' : 'ok'}
                        sm
                        icon={r.status === 'acik' ? 'x' : 'check'}
                        disabled={busy}
                        onClick={() => void toggleJob(r)}
                      >
                        {r.status === 'acik' ? 'Başvuruya kapat' : 'Başvuruya aç'}
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </>
      ) : (
        <Card title="Başvurular" icon="users">
          {err && <Alert tone="err">{err}</Alert>}
          <div className="field">
            <label>Durum</label>
            <Segmented value={status} onChange={setStatus} options={FILTERS} />
          </div>
          {loading ? (
            <Skeleton lines={8} />
          ) : (
            <DataTable<Assignment>
              rows={assignments}
              search
              csv
              csvName="oidb-kismi-zamanli-basvurular"
              empty={
                <EmptyState
                  icon="inbox"
                  title="Başvuru bulunamadı"
                  sub="Seçili durumda kayıt yok. Filtreyi “Hepsi” yaparak tüm başvuruları görebilirsiniz."
                />
              }
              columns={[
                {
                  key: 'studentNo',
                  header: 'Öğrenci',
                  sortable: true,
                  value: (r) => r.studentNo,
                  render: (r) => (
                    <div>
                      <b>{r.studentNo}</b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.studentEmail}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'jobTitle',
                  header: 'İlan',
                  sortable: true,
                  value: (r) => r.jobTitle,
                  render: (r) => (
                    <div>
                      <b>{r.jobTitle}</b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {money(r.hourlyRate)} / saat
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'status',
                  header: 'Durum',
                  sortable: true,
                  value: (r) => ASG_STATUS_TR[r.status] ?? r.status,
                  render: (r) => (
                    <Badge tone={ASG_TONE[r.status] ?? 'muted'}>
                      {ASG_STATUS_TR[r.status] ?? r.status}
                    </Badge>
                  ),
                },
                {
                  key: 'createdAt',
                  header: 'Başvuru tarihi',
                  sortable: true,
                  value: (r) => r.createdAt,
                  render: (r) => fmtDate(r.createdAt),
                },
                {
                  key: 'action',
                  header: 'İşlem',
                  sortable: false,
                  value: () => '',
                  render: (r) => (
                    <Button variant="subtle" sm icon="clock" onClick={() => openRow(r)}>
                      Puantaj
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Card>
      )}

      <Drawer
        open={active !== null}
        onClose={closeDrawer}
        title={active ? `${active.studentNo} · ${active.jobTitle}` : 'Başvuru'}
      >
        {active && (
          <>
            {drawerErr && <Alert tone="err">{drawerErr}</Alert>}

            <div className="field">
              <label>Öğrenci</label>
              <div>
                <b>{active.studentNo}</b> · {active.studentEmail}
              </div>
            </div>
            <div className="field">
              <label>İlan</label>
              <div>
                <b>{active.jobTitle}</b> · {money(active.hourlyRate)} / saat
              </div>
            </div>
            <div className="field">
              <label>Durum</label>
              <div className="row" style={{ gap: 8 }}>
                <Badge tone={ASG_TONE[active.status] ?? 'muted'}>
                  {ASG_STATUS_TR[active.status] ?? active.status}
                </Badge>
                <span className="muted" style={{ fontSize: 12 }}>
                  Başvuru: {fmtDate(active.createdAt)}
                </span>
              </div>
            </div>

            <div className="field">
              <label>Durum güncelle</label>
              <div className="row" style={{ gap: 8 }}>
                {NEXT_STATUS.map((s) => (
                  <Button
                    key={s}
                    sm
                    variant={s === 'red' ? 'danger' : s === 'bitti' ? 'ok' : 'subtle'}
                    icon={s === 'red' ? 'x' : 'check'}
                    disabled={busy || active.status === s}
                    onClick={() => void setAssignmentStatus(active, s)}
                  >
                    {ASG_STATUS_TR[s]}
                  </Button>
                ))}
              </div>
              <div className="hint-sm">
                Puantaj girişi için başvurunun kabul edilmiş olması önerilir.
              </div>
            </div>

            <div className="field">
              <label>Puantaj ekle</label>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <input
                    className="input"
                    value={sheetForm.period}
                    maxLength={40}
                    placeholder="2026-01"
                    aria-label="Puantaj dönemi"
                    onChange={(e) => setSheetForm((f) => ({ ...f, period: e.target.value }))}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 110 }}>
                  <input
                    className="input"
                    value={sheetForm.hours}
                    inputMode="decimal"
                    placeholder="Saat (örn. 48)"
                    aria-label="Çalışma saati"
                    onChange={(e) => setSheetForm((f) => ({ ...f, hours: e.target.value }))}
                  />
                </div>
                <Button
                  sm
                  icon="check"
                  disabled={busy}
                  onClick={() => void addSheet(active)}
                >
                  Ekle
                </Button>
              </div>
              <div className="hint-sm">Dönem ay bazındadır (YYYY-AA). Ücret onayda hesaplanır.</div>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label>Puantaj kayıtları</label>
              {sheetsLoading ? (
                <Skeleton lines={4} />
              ) : sheets.length === 0 ? (
                <EmptyState
                  icon="clock"
                  title="Puantaj kaydı yok"
                  sub="Bu atama için henüz aylık çalışma saati girilmemiş."
                />
              ) : (
                <>
                  <DataTable<Timesheet>
                    rows={sheets}
                    search={false}
                    pageSize={12}
                    columns={[
                      {
                        key: 'period',
                        header: 'Dönem',
                        sortable: true,
                        value: (r) => r.period,
                      },
                      {
                        key: 'hours',
                        header: 'Saat',
                        sortable: true,
                        num: true,
                        value: (r) => Number(r.hours),
                        render: (r) => Number(r.hours).toLocaleString('tr-TR'),
                      },
                      {
                        key: 'amount',
                        header: 'Ücret',
                        sortable: true,
                        num: true,
                        value: (r) => r.amount ?? 0,
                        render: (r) =>
                          r.approved ? (
                            <b>{money(r.amount)}</b>
                          ) : (
                            <span className="muted">Onay bekliyor</span>
                          ),
                      },
                      {
                        key: 'approved',
                        header: 'Onay',
                        sortable: true,
                        value: (r) => (r.approved ? 'Onaylı' : 'Bekliyor'),
                        render: (r) => (
                          <Badge tone={r.approved ? 'ok' : 'warn'}>
                            {r.approved ? 'Onaylı' : 'Bekliyor'}
                          </Badge>
                        ),
                      },
                      {
                        key: 'action',
                        header: 'İşlem',
                        sortable: false,
                        value: () => '',
                        render: (r) =>
                          r.approved ? (
                            <span className="muted">—</span>
                          ) : (
                            <Button
                              variant="ok"
                              sm
                              icon="check"
                              disabled={busy}
                              onClick={() => void approveSheet(active, r)}
                            >
                              Onayla
                            </Button>
                          ),
                      },
                    ]}
                  />
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      Onaylanan toplam ücret
                    </span>
                    <b>{money(approvedTotal)}</b>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
