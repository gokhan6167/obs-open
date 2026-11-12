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
  EmptyState,
  Segmented,
  BarChart,
  Drawer,
  toast,
  fmtDate,
} from '@/app/ui';

/* ----------------------------- TİPLER ----------------------------- */
interface Program {
  id: string;
  code: string;
  name: string;
  level: string;
}
interface Review {
  id: string;
  programId: string;
  programCode: string;
  programName: string;
  year: number;
  studentCount: number | null;
  graduateCount: number | null;
  avgGpa: string | null;
  employmentRate: string | null;
  satisfaction: string | null;
  note: string | null;
  createdAt: string;
}
interface AccFile {
  id: string;
  programId: string;
  programCode: string;
  programName: string;
  body: string;
  cycle: string | null;
  status: string;
  visitDate: string | null;
  note: string | null;
  createdAt: string;
  findingCount: number;
  openFindingCount: number;
}
interface CorrectiveAction {
  id: string;
  accreditationId: string;
  finding: string;
  action: string | null;
  dueOn: string | null;
  status: string;
  createdAt: string;
}

type Tab = 'izleme' | 'akreditasyon';
type AccStatus = 'hazirlik' | 'basvuru' | 'saha_ziyareti' | 'akredite' | 'red';
type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted';

/* ----------------------------- SABİTLER ----------------------------- */
const TABS: { value: Tab; label: string }[] = [
  { value: 'izleme', label: 'Program İzleme' },
  { value: 'akreditasyon', label: 'Akreditasyon' },
];

const ACC_STATUS_TR: Record<string, string> = {
  hazirlik: 'Hazırlık',
  basvuru: 'Başvuru',
  saha_ziyareti: 'Saha Ziyareti',
  akredite: 'Akredite',
  red: 'Red',
};
const ACC_STATUS_TONE: Record<string, Tone> = {
  hazirlik: 'muted',
  basvuru: 'info',
  saha_ziyareti: 'warn',
  akredite: 'ok',
  red: 'danger',
};
const ACC_STATUS_ORDER: AccStatus[] = [
  'hazirlik',
  'basvuru',
  'saha_ziyareti',
  'akredite',
  'red',
];

const ACTION_STATUS_TR: Record<string, string> = {
  acik: 'Açık',
  devam: 'Devam ediyor',
  kapali: 'Kapalı',
};
const ACTION_STATUS_TONE: Record<string, Tone> = {
  acik: 'danger',
  devam: 'warn',
  kapali: 'ok',
};

/** Yaygın akreditasyon kuruluşları; serbest metin de girilebilir. */
const BODIES = ['MÜDEK', 'FEDEK', 'ABET'];

const msg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);
const num = (s: string | null): number | null => (s === null || s === '' ? null : Number(s));
const gpaText = (s: string | null): string => (s === null ? '—' : Number(s).toFixed(2));
const pctText = (s: string | null): string => (s === null ? '—' : `%${Number(s).toFixed(1)}`);
const progLabel = (p: Program): string => `${p.code} · ${p.name}`;

export default function ProgramIzlemePage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('izleme');

  /* --- ortak: program listesi --- */
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsErr, setProgramsErr] = useState('');

  /* --- program izleme --- */
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsErr, setReviewsErr] = useState('');
  const [reviewsLoading, setReviewsLoading] = useState(true);

  const [rProgramId, setRProgramId] = useState('');
  const [rYear, setRYear] = useState(String(new Date().getFullYear() - 1));
  const [rStudentCount, setRStudentCount] = useState('');
  const [rGraduateCount, setRGraduateCount] = useState('');
  const [rAvgGpa, setRAvgGpa] = useState('');
  const [rEmployment, setREmployment] = useState('');
  const [rSatisfaction, setRSatisfaction] = useState('');
  const [rNote, setRNote] = useState('');
  const [reviewFormErr, setReviewFormErr] = useState('');

  /* --- akreditasyon --- */
  const [files, setFiles] = useState<AccFile[]>([]);
  const [filesErr, setFilesErr] = useState('');
  const [filesLoading, setFilesLoading] = useState(true);

  const [aProgramId, setAProgramId] = useState('');
  const [aBody, setABody] = useState(BODIES[0] ?? 'MÜDEK');
  const [aCycle, setACycle] = useState('');
  const [aVisitDate, setAVisitDate] = useState('');
  const [accFormErr, setAccFormErr] = useState('');

  /* --- seçili dosya (Drawer) --- */
  const [selected, setSelected] = useState<AccFile | null>(null);
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [actionsErr, setActionsErr] = useState('');
  const [actionsLoading, setActionsLoading] = useState(false);
  const [drawerErr, setDrawerErr] = useState('');

  const [newStatus, setNewStatus] = useState<AccStatus>('hazirlik');
  const [fFinding, setFFinding] = useState('');
  const [fAction, setFAction] = useState('');
  const [fDueOn, setFDueOn] = useState('');

  const [busy, setBusy] = useState(false);

  /* ----------------------------- YÜKLEME ----------------------------- */
  const loadReviews = useCallback(async () => {
    setReviews(await api<Review[]>('/quality/program-reviews'));
  }, []);

  const loadFiles = useCallback(async () => {
    setFiles(await api<AccFile[]>('/quality/accreditation'));
  }, []);

  useEffect(() => {
    api<Program[]>('/programs')
      .then((p) => {
        setPrograms(p);
        if (p[0]) {
          setRProgramId(p[0].id);
          setAProgramId(p[0].id);
        }
      })
      .catch((e) => setProgramsErr(msg(e, 'Program listesi alınamadı')));
  }, []);

  useEffect(() => {
    loadReviews()
      .catch((e) => setReviewsErr(msg(e, 'İzleme kayıtları alınamadı')))
      .finally(() => setReviewsLoading(false));
  }, [loadReviews]);

  useEffect(() => {
    loadFiles()
      .catch((e) => setFilesErr(msg(e, 'Akreditasyon dosyaları alınamadı')))
      .finally(() => setFilesLoading(false));
  }, [loadFiles]);

  const loadActions = useCallback(async (accreditationId: string) => {
    setActionsLoading(true);
    setActionsErr('');
    try {
      setActions(await api<CorrectiveAction[]>(`/quality/accreditation/${accreditationId}/actions`));
    } catch (e) {
      setActions([]);
      setActionsErr(msg(e, 'Düzeltici eylemler alınamadı'));
    } finally {
      setActionsLoading(false);
    }
  }, []);

  /* ----------------------------- TÜRETİLMİŞ ----------------------------- */
  /* Yıllara göre toplam mezun sayısı (eskiden yeniye, son 10 yıl). */
  const gradByYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of reviews) {
      map.set(r.year, (map.get(r.year) ?? 0) + (r.graduateCount ?? 0));
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(-10)
      .map(([year, value]) => ({ label: String(year), value }));
  }, [reviews]);

  const reviewStats = useMemo(() => {
    const grads = reviews.reduce((s, r) => s + (r.graduateCount ?? 0), 0);
    const students = reviews.reduce((s, r) => s + (r.studentCount ?? 0), 0);
    const emp = reviews.map((r) => num(r.employmentRate)).filter((n): n is number => n !== null);
    const avgEmp = emp.length > 0 ? emp.reduce((s, n) => s + n, 0) / emp.length : null;
    return { grads, students, avgEmp };
  }, [reviews]);

  const openFindingsTotal = useMemo(
    () => files.reduce((s, f) => s + f.openFindingCount, 0),
    [files],
  );

  const selectedOpenCount = useMemo(
    () => actions.filter((a) => a.status === 'acik' || a.status === 'devam').length,
    [actions],
  );

  /* ----------------------------- İŞLEMLER ----------------------------- */
  async function run(setErr: (m: string) => void, fn: () => Promise<void>): Promise<void> {
    setBusy(true);
    setErr('');
    try {
      await fn();
    } catch (e) {
      const m = msg(e, 'İşlem başarısız');
      setErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  /** Boş bırakılabilen sayısal alanı doğrula; hata varsa mesaj döner. */
  function checkNum(raw: string, label: string, min: number, max: number): string | null {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    if (Number.isNaN(n) || n < min || n > max) return `${label} ${min}–${max} arasında olmalıdır.`;
    return null;
  }

  async function createReview(): Promise<void> {
    if (!rProgramId) {
      setReviewFormErr('Program seçin.');
      return;
    }
    const year = Number(rYear);
    if (!rYear || Number.isNaN(year) || year < 1900 || year > 2200) {
      setReviewFormErr('Yıl 1900–2200 arasında olmalıdır.');
      return;
    }
    const invalid =
      checkNum(rStudentCount, 'Öğrenci sayısı', 0, 1_000_000) ??
      checkNum(rGraduateCount, 'Mezun sayısı', 0, 1_000_000) ??
      checkNum(rAvgGpa, 'Ortalama GNO', 0, 4) ??
      checkNum(rEmployment, 'İstihdam oranı', 0, 100) ??
      checkNum(rSatisfaction, 'Memnuniyet', 0, 100);
    if (invalid) {
      setReviewFormErr(invalid);
      return;
    }
    await run(setReviewFormErr, async () => {
      await api('/quality/program-reviews', {
        method: 'POST',
        body: {
          programId: rProgramId,
          year,
          ...(rStudentCount.trim() ? { studentCount: Number(rStudentCount) } : {}),
          ...(rGraduateCount.trim() ? { graduateCount: Number(rGraduateCount) } : {}),
          ...(rAvgGpa.trim() ? { avgGpa: Number(rAvgGpa) } : {}),
          ...(rEmployment.trim() ? { employmentRate: Number(rEmployment) } : {}),
          ...(rSatisfaction.trim() ? { satisfaction: Number(rSatisfaction) } : {}),
          ...(rNote.trim() ? { note: rNote.trim() } : {}),
        },
      });
      const p = programs.find((x) => x.id === rProgramId);
      toast('İzleme kaydı oluşturuldu', { tone: 'ok', body: `${p?.code ?? ''} · ${year}` });
      setRStudentCount('');
      setRGraduateCount('');
      setRAvgGpa('');
      setREmployment('');
      setRSatisfaction('');
      setRNote('');
      await loadReviews();
    });
  }

  async function createFile(): Promise<void> {
    if (!aProgramId) {
      setAccFormErr('Program seçin.');
      return;
    }
    if (!aBody.trim()) {
      setAccFormErr('Akreditasyon kuruluşu zorunludur.');
      return;
    }
    await run(setAccFormErr, async () => {
      await api('/quality/accreditation', {
        method: 'POST',
        body: {
          programId: aProgramId,
          body: aBody.trim(),
          ...(aCycle.trim() ? { cycle: aCycle.trim() } : {}),
          ...(aVisitDate ? { visitDate: aVisitDate } : {}),
        },
      });
      const p = programs.find((x) => x.id === aProgramId);
      toast('Akreditasyon dosyası açıldı', { tone: 'ok', body: `${p?.code ?? ''} · ${aBody}` });
      setACycle('');
      setAVisitDate('');
      await loadFiles();
    });
  }

  async function changeStatus(): Promise<void> {
    if (!selected) return;
    await run(setDrawerErr, async () => {
      await api(`/quality/accreditation/${selected.id}`, {
        method: 'PATCH',
        body: { status: newStatus },
      });
      toast('Dosya durumu güncellendi', {
        tone: 'ok',
        body: `${selected.programCode} · ${ACC_STATUS_TR[newStatus]}`,
      });
      const fresh = await api<AccFile[]>('/quality/accreditation');
      setFiles(fresh);
      setSelected(fresh.find((f) => f.id === selected.id) ?? null);
    });
  }

  async function addAction(): Promise<void> {
    if (!selected) return;
    if (!fFinding.trim()) {
      setDrawerErr('Bulgu metni zorunludur.');
      return;
    }
    await run(setDrawerErr, async () => {
      await api(`/quality/accreditation/${selected.id}/actions`, {
        method: 'POST',
        body: {
          finding: fFinding.trim(),
          ...(fAction.trim() ? { action: fAction.trim() } : {}),
          ...(fDueOn ? { dueOn: fDueOn } : {}),
        },
      });
      toast('Bulgu eklendi', { tone: 'ok', body: 'Düzeltici eylem açık olarak kaydedildi' });
      setFFinding('');
      setFAction('');
      setFDueOn('');
      await loadActions(selected.id);
      await loadFiles();
    });
  }

  async function closeAction(a: CorrectiveAction): Promise<void> {
    if (!selected) return;
    await run(setDrawerErr, async () => {
      await api(`/quality/actions/${a.id}`, { method: 'PATCH', body: { status: 'kapali' } });
      toast('Düzeltici eylem kapatıldı', { tone: 'ok' });
      await loadActions(selected.id);
      await loadFiles();
    });
  }

  function openFile(f: AccFile): void {
    setSelected(f);
    setNewStatus(f.status as AccStatus);
    setDrawerErr('');
    setFFinding('');
    setFAction('');
    setFDueOn('');
    void loadActions(f.id);
  }

  function closeDrawer(): void {
    setSelected(null);
    setActions([]);
    setActionsErr('');
    setDrawerErr('');
  }

  /* ----------------------------- RENDER ----------------------------- */
  return (
    <>
      <PageHeader
        title="Program İzleme & Akreditasyon"
        sub="Programların yıllık kalite göstergelerini izleyin, akreditasyon dosyalarını ve saha ziyareti bulgularına ait düzeltici eylemleri yönetin."
      />

      <Card>
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </Card>

      {programsErr && <Alert tone="err">{programsErr}</Alert>}

      {/* ============================ PROGRAM İZLEME ============================ */}
      {tab === 'izleme' && (
        <>
          {reviewsErr && <Alert tone="err">{reviewsErr}</Alert>}

          {reviewsLoading ? (
            <Skeleton lines={6} />
          ) : (
            <>
              <StatGrid
                stats={[
                  { label: 'İzleme kaydı', value: reviews.length, icon: 'fileText' },
                  { label: 'Toplam öğrenci', value: reviewStats.students, icon: 'users' },
                  { label: 'Toplam mezun', value: reviewStats.grads, icon: 'award' },
                  {
                    label: 'Ortalama istihdam',
                    value:
                      reviewStats.avgEmp === null ? '—' : `%${reviewStats.avgEmp.toFixed(1)}`,
                    icon: 'activity',
                    tone:
                      reviewStats.avgEmp !== null && reviewStats.avgEmp >= 70 ? 'ok' : undefined,
                  },
                ]}
              />

              <Card
                title="Yıllara göre mezun sayısı"
                icon="chart"
                hint="Tüm programların ilgili yıla ait izleme kayıtlarındaki mezun sayıları toplanır."
              >
                {gradByYear.length === 0 ? (
                  <EmptyState
                    icon="chart"
                    title="Grafik için veri yok"
                    sub="Mezun sayısı girilmiş bir izleme kaydı ekleyin."
                  />
                ) : (
                  <div style={{ paddingBottom: 22 }}>
                    <BarChart data={gradByYear} />
                  </div>
                )}
              </Card>

              <Card title="Program izleme kayıtları" icon="grade">
                <DataTable<Review>
                  rows={reviews}
                  search
                  csv
                  csvName="oidb-program-izleme"
                  pageSize={20}
                  empty={
                    <EmptyState
                      icon="grade"
                      title="İzleme kaydı yok"
                      sub="Aşağıdaki formdan bir program ve yıl için gösterge kaydı oluşturun."
                    />
                  }
                  columns={[
                    {
                      key: 'program',
                      header: 'Program',
                      value: (r) => `${r.programCode} ${r.programName}`,
                      render: (r) => (
                        <div>
                          <b>{r.programCode}</b>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {r.programName}
                          </div>
                        </div>
                      ),
                    },
                    { key: 'year', header: 'Yıl', num: true, value: (r) => r.year },
                    {
                      key: 'studentCount',
                      header: 'Öğrenci',
                      num: true,
                      value: (r) => r.studentCount ?? 0,
                      render: (r) => r.studentCount ?? <span className="muted">—</span>,
                    },
                    {
                      key: 'graduateCount',
                      header: 'Mezun',
                      num: true,
                      value: (r) => r.graduateCount ?? 0,
                      render: (r) => r.graduateCount ?? <span className="muted">—</span>,
                    },
                    {
                      key: 'avgGpa',
                      header: 'Ort. GNO',
                      num: true,
                      value: (r) => num(r.avgGpa) ?? 0,
                      render: (r) => gpaText(r.avgGpa),
                    },
                    {
                      key: 'employmentRate',
                      header: 'İstihdam',
                      num: true,
                      value: (r) => num(r.employmentRate) ?? 0,
                      render: (r) => pctText(r.employmentRate),
                    },
                    {
                      key: 'satisfaction',
                      header: 'Memnuniyet',
                      num: true,
                      value: (r) => num(r.satisfaction) ?? 0,
                      render: (r) => pctText(r.satisfaction),
                    },
                  ]}
                />
              </Card>
            </>
          )}

          <Card
            title="Yeni izleme kaydı"
            icon="edit"
            hint="Her program için bir yılda tek kayıt tutulur; aynı program ve yıl tekrar girilemez."
          >
            {reviewFormErr && <Alert tone="err">{reviewFormErr}</Alert>}
            <div className="field">
              <label>Program</label>
              <select value={rProgramId} onChange={(e) => setRProgramId(e.target.value)}>
                <option value="">— Seçiniz —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {progLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Yıl</label>
              <input
                type="number"
                min={1900}
                max={2200}
                value={rYear}
                onChange={(e) => setRYear(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Öğrenci sayısı</label>
              <input
                type="number"
                min={0}
                value={rStudentCount}
                onChange={(e) => setRStudentCount(e.target.value)}
                placeholder="420"
              />
            </div>
            <div className="field">
              <label>Mezun sayısı</label>
              <input
                type="number"
                min={0}
                value={rGraduateCount}
                onChange={(e) => setRGraduateCount(e.target.value)}
                placeholder="78"
              />
            </div>
            <div className="field">
              <label>Ortalama GNO</label>
              <input
                type="number"
                min={0}
                max={4}
                step="0.01"
                value={rAvgGpa}
                onChange={(e) => setRAvgGpa(e.target.value)}
                placeholder="3.05"
              />
              <div className="hint-sm">4.00 üzerinden ağırlıklı genel not ortalaması.</div>
            </div>
            <div className="field">
              <label>İstihdam oranı (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={rEmployment}
                onChange={(e) => setREmployment(e.target.value)}
                placeholder="72.5"
              />
            </div>
            <div className="field">
              <label>Memnuniyet (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={rSatisfaction}
                onChange={(e) => setRSatisfaction(e.target.value)}
                placeholder="84"
              />
            </div>
            <div className="field">
              <label>Not</label>
              <textarea
                value={rNote}
                onChange={(e) => setRNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Değerlendirme notu (isteğe bağlı)"
              />
            </div>
            <Button icon="check" disabled={busy} onClick={() => void createReview()}>
              Kaydı oluştur
            </Button>
          </Card>
        </>
      )}

      {/* ============================ AKREDİTASYON ============================ */}
      {tab === 'akreditasyon' && (
        <>
          {filesErr && <Alert tone="err">{filesErr}</Alert>}

          {filesLoading ? (
            <Skeleton lines={6} />
          ) : (
            <>
              <StatGrid
                stats={[
                  { label: 'Dosya', value: files.length, icon: 'file' },
                  {
                    label: 'Akredite',
                    value: files.filter((f) => f.status === 'akredite').length,
                    icon: 'award',
                    tone: 'ok',
                  },
                  {
                    label: 'Saha ziyareti',
                    value: files.filter((f) => f.status === 'saha_ziyareti').length,
                    icon: 'building',
                  },
                  {
                    label: 'Açık bulgu',
                    value: openFindingsTotal,
                    icon: 'alert',
                    tone: openFindingsTotal > 0 ? 'warn' : 'ok',
                  },
                ]}
              />

              <Card
                title="Akreditasyon dosyaları"
                icon="shield"
                hint="Dosya satırındaki düğme ile düzeltici eylemleri ve durum güncellemesini açın."
                actions={
                  <Button
                    variant="subtle"
                    sm
                    icon="refresh"
                    disabled={busy}
                    onClick={() =>
                      void loadFiles().catch((e) =>
                        setFilesErr(msg(e, 'Akreditasyon dosyaları alınamadı')),
                      )
                    }
                  >
                    Yenile
                  </Button>
                }
              >
                <DataTable<AccFile>
                  rows={files}
                  search
                  pageSize={20}
                  empty={
                    <EmptyState
                      icon="shield"
                      title="Akreditasyon dosyası yok"
                      sub="Aşağıdaki formdan bir program için MÜDEK/FEDEK/ABET dosyası açabilirsiniz."
                    />
                  }
                  columns={[
                    {
                      key: 'program',
                      header: 'Program',
                      value: (r) => `${r.programCode} ${r.programName}`,
                      render: (r) => (
                        <div>
                          <b>{r.programCode}</b>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {r.programName}
                          </div>
                        </div>
                      ),
                    },
                    { key: 'body', header: 'Kuruluş', value: (r) => r.body },
                    {
                      key: 'cycle',
                      header: 'Döngü',
                      value: (r) => r.cycle ?? '',
                      render: (r) => r.cycle ?? <span className="muted">—</span>,
                    },
                    {
                      key: 'status',
                      header: 'Durum',
                      value: (r) => ACC_STATUS_TR[r.status] ?? r.status,
                      render: (r) => (
                        <Badge tone={ACC_STATUS_TONE[r.status] ?? 'muted'}>
                          {ACC_STATUS_TR[r.status] ?? r.status}
                        </Badge>
                      ),
                    },
                    {
                      key: 'visitDate',
                      header: 'Ziyaret',
                      value: (r) => r.visitDate ?? '',
                      render: (r) =>
                        r.visitDate ? fmtDate(r.visitDate) : <span className="muted">—</span>,
                    },
                    {
                      key: 'findingCount',
                      header: 'Bulgu',
                      num: true,
                      value: (r) => r.findingCount,
                      render: (r) => (
                        <span>
                          {r.findingCount}
                          {r.openFindingCount > 0 && (
                            <span style={{ marginLeft: 6 }}>
                              <Badge tone="warn">{r.openFindingCount} açık</Badge>
                            </span>
                          )}
                        </span>
                      ),
                    },
                    {
                      key: 'action',
                      header: 'İşlem',
                      sortable: false,
                      render: (r) => (
                        <Button variant="subtle" sm icon="layers" onClick={() => openFile(r)}>
                          Dosya
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            </>
          )}

          <Card
            title="Yeni akreditasyon dosyası"
            icon="file"
            hint="Dosya 'Hazırlık' durumunda açılır; sonraki aşamalar dosya panelinden yürütülür."
          >
            {accFormErr && <Alert tone="err">{accFormErr}</Alert>}
            <div className="field">
              <label>Program</label>
              <select value={aProgramId} onChange={(e) => setAProgramId(e.target.value)}>
                <option value="">— Seçiniz —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {progLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Kuruluş</label>
              <select value={aBody} onChange={(e) => setABody(e.target.value)}>
                {BODIES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Döngü</label>
              <input
                value={aCycle}
                onChange={(e) => setACycle(e.target.value)}
                placeholder="2026-2031"
                maxLength={60}
              />
            </div>
            <div className="field">
              <label>Saha ziyareti tarihi</label>
              <input
                type="date"
                value={aVisitDate}
                onChange={(e) => setAVisitDate(e.target.value)}
              />
              <div className="hint-sm">Tarih henüz belli değilse boş bırakılabilir.</div>
            </div>
            <Button icon="check" disabled={busy} onClick={() => void createFile()}>
              Dosyayı aç
            </Button>
          </Card>
        </>
      )}

      {/* ============================ DOSYA PANELİ ============================ */}
      <Drawer
        open={selected !== null}
        onClose={closeDrawer}
        title={selected ? `${selected.programCode} · ${selected.body}` : ''}
      >
        {selected && (
          <>
            {drawerErr && <Alert tone="err">{drawerErr}</Alert>}

            <div className="row" style={{ gap: 8, marginBottom: 14 }}>
              <Badge tone={ACC_STATUS_TONE[selected.status] ?? 'muted'}>
                {ACC_STATUS_TR[selected.status] ?? selected.status}
              </Badge>
              {selected.cycle && <Badge tone="muted">{selected.cycle}</Badge>}
              {selected.visitDate && <Badge tone="info">Ziyaret {fmtDate(selected.visitDate)}</Badge>}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
              {selected.programName}
            </div>

            {/* --- durum güncelleme --- */}
            <div className="field">
              <label>Dosya durumu</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as AccStatus)}
              >
                {ACC_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {ACC_STATUS_TR[s]}
                  </option>
                ))}
              </select>
              <div className="hint-sm">
                Akreditasyon kararı, açık veya devam eden düzeltici eylem kalmadığında verilebilir.
              </div>
            </div>
            {newStatus === 'akredite' && selectedOpenCount > 0 && (
              <Alert tone="warn">
                Bu dosyada {selectedOpenCount} adet açık/devam eden düzeltici eylem var. Dosya
                akredite edilmeden önce bunların kapatılması gerekir.
              </Alert>
            )}
            <Button
              icon="check"
              disabled={busy || newStatus === selected.status}
              onClick={() => void changeStatus()}
            >
              Durumu güncelle
            </Button>

            {/* --- düzeltici eylemler --- */}
            <div style={{ marginTop: 26, marginBottom: 10, fontWeight: 700, fontSize: 14 }}>
              Düzeltici eylemler
            </div>
            {actionsErr && <Alert tone="err">{actionsErr}</Alert>}
            {actionsLoading ? (
              <Skeleton lines={4} />
            ) : actions.length === 0 ? (
              <EmptyState
                icon="check"
                title="Bulgu yok"
                sub="Saha ziyareti raporundaki bulguları aşağıdan ekleyebilirsiniz."
              />
            ) : (
              <DataTable<CorrectiveAction>
                rows={actions}
                search={false}
                pageSize={10}
                columns={[
                  {
                    key: 'finding',
                    header: 'Bulgu / eylem',
                    value: (r) => r.finding,
                    render: (r) => (
                      <div>
                        <b>{r.finding}</b>
                        {r.action && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                            {r.action}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'dueOn',
                    header: 'Termin',
                    value: (r) => r.dueOn ?? '',
                    render: (r) =>
                      r.dueOn ? fmtDate(r.dueOn) : <span className="muted">—</span>,
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    value: (r) => ACTION_STATUS_TR[r.status] ?? r.status,
                    render: (r) => (
                      <Badge tone={ACTION_STATUS_TONE[r.status] ?? 'muted'}>
                        {ACTION_STATUS_TR[r.status] ?? r.status}
                      </Badge>
                    ),
                  },
                  {
                    key: 'close',
                    header: 'İşlem',
                    sortable: false,
                    render: (r) =>
                      r.status === 'kapali' ? (
                        <span className="muted">Kapandı</span>
                      ) : (
                        <Button
                          variant="ok"
                          sm
                          disabled={busy}
                          onClick={() => void closeAction(r)}
                        >
                          Kapat
                        </Button>
                      ),
                  },
                ]}
              />
            )}

            {/* --- bulgu ekle --- */}
            <div style={{ marginTop: 26, marginBottom: 10, fontWeight: 700, fontSize: 14 }}>
              Bulgu ekle
            </div>
            <div className="field">
              <label>Bulgu</label>
              <textarea
                value={fFinding}
                onChange={(e) => setFFinding(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Ölçme-değerlendirme kanıtları yetersiz."
              />
            </div>
            <div className="field">
              <label>Düzeltici eylem</label>
              <textarea
                value={fAction}
                onChange={(e) => setFAction(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Her ders için çıktı ölçüm dosyası oluşturulacak (isteğe bağlı)"
              />
            </div>
            <div className="field">
              <label>Termin tarihi</label>
              <input type="date" value={fDueOn} onChange={(e) => setFDueOn(e.target.value)} />
            </div>
            <Button icon="check" disabled={busy} onClick={() => void addAction()}>
              Bulguyu kaydet
            </Button>
          </>
        )}
      </Drawer>
    </>
  );
}
