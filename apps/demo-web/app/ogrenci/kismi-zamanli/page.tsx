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
  Icon,
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

interface MyAssignment {
  id: string;
  jobId: string;
  jobTitle: string;
  unit: string | null;
  hourlyRate: number | null;
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

type Tab = 'ilanlar' | 'basvurularim';

const STATUS_TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  kabul: 'Kabul',
  devam: 'Devam ediyor',
  bitti: 'Tamamlandı',
  red: 'Reddedildi',
};
const statusLabel = (s: string): string => STATUS_TR[s] ?? s;

function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (s === 'bitti') return 'ok';
  if (s === 'red') return 'danger';
  if (s === 'kabul' || s === 'devam') return 'info';
  return 'muted';
}

/** numeric(6,2) sürücüden metin gelir; tr biçimiyle göster. */
const fmtHours = (h: string): string =>
  Number(h).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' saat';

export default function OgrenciKismiZamanli(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('ilanlar');

  const [jobs, setJobs] = useState<Job[]>([]);
  const [mine, setMine] = useState<MyAssignment[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  // Puantaj sürgüsü.
  const [sel, setSel] = useState<MyAssignment | null>(null);
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [sheetErr, setSheetErr] = useState('');
  const [sheetLoading, setSheetLoading] = useState(false);

  const load = useCallback(async () => {
    const [jobList, assignments] = await Promise.all([
      api<Job[]>('/part-time/jobs'),
      api<MyAssignment[]>('/part-time/assignments/my'),
    ]);
    setJobs(jobList ?? []);
    setMine(assignments ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Kısmi zamanlı bilgileri yüklenemedi'))
      .finally(() => setLoading(false));
  }, [load]);

  /** Başvurulmuş ilanlar — tekrar başvuru gösterilmez. */
  const appliedJobIds = useMemo(() => new Set(mine.map((a) => a.jobId)), [mine]);

  /** Açık ilanlar üstte. */
  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => Number(b.status === 'acik') - Number(a.status === 'acik')),
    [jobs],
  );

  const stats = useMemo(
    () => ({
      open: jobs.filter((j) => j.status === 'acik').length,
      applied: mine.length,
      active: mine.filter((a) => a.status === 'kabul' || a.status === 'devam').length,
      done: mine.filter((a) => a.status === 'bitti').length,
    }),
    [jobs, mine],
  );

  async function apply(job: Job): Promise<void> {
    setBusyId(job.id);
    try {
      await api(`/part-time/jobs/${job.id}/apply`, { method: 'POST' });
      toast('Başvurunuz alındı', { tone: 'ok', body: job.title });
      await load();
      setTab('basvurularim');
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Başvuru başarısız';
      // 409 · aynı ilana ikinci başvuru: uyarı ver, listeyi tazele.
      const already = /zaten başvur/i.test(m);
      if (already) {
        toast('Bu ilana zaten başvurdunuz', { tone: 'info', body: job.title });
        await load().catch(() => undefined);
      } else {
        toast('Başvuru başarısız', { tone: 'err', body: m });
      }
    } finally {
      setBusyId('');
    }
  }

  function openTimesheets(a: MyAssignment): void {
    setSel(a);
    setSheets([]);
    setSheetErr('');
    setSheetLoading(true);
    api<Timesheet[]>(`/part-time/assignments/${a.id}/timesheets`)
      .then((rows) => setSheets(rows ?? []))
      .catch((e) => setSheetErr(e instanceof Error ? e.message : 'Puantajlar yüklenemedi'))
      .finally(() => setSheetLoading(false));
  }

  const sheetTotals = useMemo(() => {
    const hours = sheets.reduce((t, s) => t + Number(s.hours), 0);
    const amount = sheets.reduce((t, s) => t + (s.amount ?? 0), 0);
    return { hours, amount };
  }, [sheets]);

  return (
    <>
      <PageHeader
        title="Kısmi Zamanlı Çalışma"
        sub="Üniversite birimlerinin kısmi zamanlı ilanlarına başvurun, atamalarınızı ve puantajlarınızı takip edin."
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Açık ilan', value: stats.open, icon: 'inbox' },
            { label: 'Başvurum', value: stats.applied, icon: 'fileText' },
            { label: 'Devam eden', value: stats.active, icon: 'activity', tone: 'ok' },
            { label: 'Tamamlanan', value: stats.done, icon: 'checkCircle' },
          ]}
        />
      )}

      <div className="row" style={{ marginBottom: 14 }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ilanlar', label: 'Açık İlanlar' },
            { value: 'basvurularim', label: 'Başvurularım' },
          ]}
        />
      </div>

      {err && <Alert tone="err">{err}</Alert>}

      {tab === 'ilanlar' ? (
        loading ? (
          <Skeleton lines={6} />
        ) : sortedJobs.length === 0 ? (
          <Card title="Kısmi zamanlı ilanlar" icon="inbox">
            <EmptyState
              icon="inbox"
              title="Yayımlanmış ilan bulunmuyor"
              sub="Birimler yeni ilan açtığında bu sayfada listelenir."
            />
          </Card>
        ) : (
          <div className="two-col">
            {sortedJobs.map((j) => {
              const open = j.status === 'acik';
              const applied = appliedJobIds.has(j.id);
              return (
                <div
                  key={j.id}
                  className="card"
                  style={open ? { borderColor: 'var(--accent)' } : { opacity: 0.72 }}
                >
                  <div className="card-head">
                    <h2>
                      <Icon name="building" className="h-ico" />
                      {j.title}
                    </h2>
                    <div className="row">
                      <Badge tone={open ? 'ok' : 'muted'}>{open ? 'Açık' : 'Kapalı'}</Badge>
                    </div>
                  </div>

                  <div className="stack" style={{ marginBottom: 12 }}>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {j.unit ?? 'Birim belirtilmemiş'}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-2)' }}>
                      Saat ücreti: {money(j.hourlyRate)}
                    </div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {j.quota != null ? `Kontenjan: ${j.quota} · ` : ''}
                      {j.applicationCount} başvuru · {fmtDate(j.createdAt)}
                    </div>
                  </div>

                  {j.description ? (
                    <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: '0 0 14px' }}>
                      {j.description}
                    </p>
                  ) : (
                    <p className="muted" style={{ fontSize: 13.5, margin: '0 0 14px' }}>
                      Açıklama girilmemiş.
                    </p>
                  )}

                  {applied ? (
                    <Badge tone="info">Başvuruldu</Badge>
                  ) : (
                    <Button
                      icon="check"
                      sm
                      disabled={!open || busyId === j.id}
                      onClick={() => void apply(j)}
                    >
                      {busyId === j.id ? 'Gönderiliyor…' : open ? 'Başvur' : 'Başvuruya kapalı'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <Card title="Başvurularım" icon="fileText">
          {loading ? (
            <Skeleton lines={6} />
          ) : (
            <DataTable<MyAssignment>
              rows={mine}
              search
              csv
              csvName="kismi-zamanli-basvurularim"
              empty={
                <EmptyState
                  icon="fileText"
                  title="Henüz başvurunuz yok"
                  sub="Açık ilanlar sekmesinden uygun bir ilana başvurabilirsiniz."
                  action={
                    <Button icon="arrowRight" onClick={() => setTab('ilanlar')}>
                      İlanları gör
                    </Button>
                  }
                />
              }
              columns={[
                {
                  key: 'jobTitle',
                  header: 'İlan',
                  sortable: true,
                  value: (r) => r.jobTitle,
                  render: (r) => (
                    <>
                      <b>{r.jobTitle}</b>
                      {r.unit && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {r.unit}
                        </div>
                      )}
                    </>
                  ),
                },
                {
                  key: 'status',
                  header: 'Durum',
                  sortable: true,
                  value: (r) => statusLabel(r.status),
                  render: (r) => <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>,
                },
                {
                  key: 'hourlyRate',
                  header: 'Saat Ücreti',
                  sortable: true,
                  num: true,
                  value: (r) => r.hourlyRate ?? 0,
                  render: (r) => money(r.hourlyRate),
                },
                {
                  key: 'createdAt',
                  header: 'Başvuru Tarihi',
                  sortable: true,
                  value: (r) => r.createdAt,
                  render: (r) => fmtDate(r.createdAt),
                },
                {
                  key: 'action',
                  header: 'Puantaj',
                  sortable: false,
                  render: (r) => (
                    <Button variant="ghost" sm icon="clock" onClick={() => openTimesheets(r)}>
                      Puantajlarım
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
        title={sel ? `Puantajlarım · ${sel.jobTitle}` : undefined}
      >
        {sel && (
          <>
            <div className="info-box" style={{ marginBottom: 14 }}>
              <div>
                <b>{sel.jobTitle}</b>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {sel.unit ?? 'Birim belirtilmemiş'} · Saat ücreti: {money(sel.hourlyRate)}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Durum: {statusLabel(sel.status)} · Başlangıç: {fmtDate(sel.startedOn)} · Bitiş:{' '}
                {fmtDate(sel.endedOn)}
              </div>
            </div>

            {sheetErr && <Alert tone="err">{sheetErr}</Alert>}

            {sheetLoading ? (
              <Skeleton lines={4} />
            ) : sheets.length === 0 ? (
              <EmptyState
                icon="clock"
                title="Puantaj kaydı yok"
                sub="Çalışmanız kayda geçtiğinde dönem bazlı puantajlarınız burada görünür."
              />
            ) : (
              <>
                {sheets.map((s) => (
                  <div className="list-item" key={s.id}>
                    <div className="li-main">
                      <strong>{s.period}</strong>
                      <div className="meta">
                        {fmtHours(s.hours)} · {fmtDate(s.createdAt)}
                      </div>
                    </div>
                    <div className="stack" style={{ alignItems: 'flex-end' }}>
                      <Badge tone={s.approved ? 'ok' : 'warn'}>
                        {s.approved ? 'Onaylı' : 'Onay bekliyor'}
                      </Badge>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>
                        {money(s.amount)}
                      </span>
                    </div>
                  </div>
                ))}
                <hr className="divider" />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted" style={{ fontSize: 13 }}>
                    Toplam {sheetTotals.hours.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}{' '}
                    saat · onaylı tutar
                  </span>
                  <b>{money(sheetTotals.amount)}</b>
                </div>
              </>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
