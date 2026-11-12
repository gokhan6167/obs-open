'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiList } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Drawer,
  Alert,
  Skeleton,
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

type AppType = 'lisans' | 'yuksek_lisans' | 'doktora' | 'yatay_gecis' | 'dikey_gecis';
type ProgramStatus = 'acik' | 'kapali' | 'tamamlandi';
type ApplicantStatus = 'basvurdu' | 'degerlendiriliyor' | 'kazandi' | 'kazanamadi' | 'kesin_kayit';

interface AppProgram {
  id: string;
  programName: string;
  type: AppType;
  year: number;
  term: string;
  quota: number;
  applicantCount: number;
  status: ProgramStatus;
  startsOn?: string | null;
  endsOn?: string | null;
  minGpa?: number | null;
}
interface Program {
  id: string;
  name: string;
  code?: string;
}
interface Applicant {
  id: string;
  fullName: string;
  nationalId: string;
  score: number | null;
  status: ApplicantStatus;
}

const TYPE_LABEL: Record<AppType, string> = {
  lisans: 'Lisans',
  yuksek_lisans: 'Yüksek Lisans',
  doktora: 'Doktora',
  yatay_gecis: 'Yatay Geçiş',
  dikey_gecis: 'Dikey Geçiş',
};
const TYPE_OPTS: AppType[] = ['lisans', 'yuksek_lisans', 'doktora', 'yatay_gecis', 'dikey_gecis'];

const PROG_STATUS: Record<ProgramStatus, { label: string; tone: 'ok' | 'warn' | 'muted' }> = {
  acik: { label: 'açık', tone: 'ok' },
  kapali: { label: 'kapalı', tone: 'muted' },
  tamamlandi: { label: 'tamamlandı', tone: 'warn' },
};

const APP_STATUS: Record<
  ApplicantStatus,
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }
> = {
  basvurdu: { label: 'başvurdu', tone: 'info' },
  degerlendiriliyor: { label: 'değerlendiriliyor', tone: 'warn' },
  kazandi: { label: 'kazandı', tone: 'ok' },
  kazanamadi: { label: 'kazanamadı', tone: 'danger' },
  kesin_kayit: { label: 'kesin kayıt', tone: 'ok' },
};

export default function Basvuru(): React.ReactElement {
  const [programs, setPrograms] = useState<AppProgram[]>([]);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Yeni başvuru programı paneli
  const [openNew, setOpenNew] = useState(false);
  const [catalog, setCatalog] = useState<Program[]>([]);
  const [catErr, setCatErr] = useState('');
  const [programId, setProgramId] = useState('');
  const [type, setType] = useState<AppType>('lisans');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [term, setTerm] = useState('Güz');
  const [quota, setQuota] = useState('30');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [minGpa, setMinGpa] = useState('');
  const [saving, setSaving] = useState(false);

  // Aday paneli
  const [selected, setSelected] = useState<AppProgram | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [appLoaded, setAppLoaded] = useState(false);
  const [appErr, setAppErr] = useState('');
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  // Yeni aday alt-paneli
  const [openNewApp, setOpenNewApp] = useState(false);
  const [naName, setNaName] = useState('');
  const [naNid, setNaNid] = useState('');
  const [naScore, setNaScore] = useState('');
  const [naSaving, setNaSaving] = useState(false);

  const load = useCallback(async () => {
    const p = await apiList<AppProgram>('/admissions/programs');
    setPrograms(p ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  const openNewPanel = useCallback(async () => {
    setOpenNew(true);
    setProgramId('');
    setType('lisans');
    setYear(String(new Date().getFullYear()));
    setTerm('Güz');
    setQuota('30');
    setStartsOn('');
    setEndsOn('');
    setMinGpa('');
    setCatErr('');
    if (catalog.length === 0) {
      try {
        const c = await api<Program[]>('/programs');
        setCatalog(c);
      } catch (e) {
        setCatErr(e instanceof Error ? e.message : 'Program listesi alınamadı');
      }
    }
  }, [catalog.length]);

  const createProgram = useCallback(async () => {
    const q = Number(quota);
    const y = Number(year);
    if (!programId || !Number.isInteger(q) || q < 0 || !Number.isInteger(y)) {
      toast('Eksik bilgi', { tone: 'err', body: 'Program, yıl ve geçerli kontenjan zorunludur.' });
      return;
    }
    const gpa = minGpa.trim() === '' ? undefined : Number(minGpa);
    if (gpa !== undefined && (Number.isNaN(gpa) || gpa < 0 || gpa > 4)) {
      toast('Geçersiz GNO', { tone: 'err', body: 'Asgari GNO 0 ile 4 arasında olmalıdır.' });
      return;
    }
    setSaving(true);
    try {
      await api('/admissions/programs', {
        method: 'POST',
        body: {
          programId,
          type,
          year: y,
          term,
          quota: q,
          startsOn: startsOn || null,
          endsOn: endsOn || null,
          minGpa: gpa ?? null,
        },
      });
      toast('Başvuru programı açıldı', {
        tone: 'ok',
        body: `${TYPE_LABEL[type]} · ${y} ${term} · ${q} kontenjan`,
      });
      setOpenNew(false);
      await load();
    } catch (e) {
      toast('Program açılamadı', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setSaving(false);
    }
  }, [programId, type, year, term, quota, startsOn, endsOn, minGpa, load]);

  const loadApplicants = useCallback(async (p: AppProgram) => {
    setSelected(p);
    setApplicants([]);
    setAppLoaded(false);
    setAppErr('');
    try {
      const a = await api<Applicant[]>(
        `/admissions/applicants?applicationProgramId=${encodeURIComponent(p.id)}`,
      );
      setApplicants(a ?? []);
      setAppLoaded(true);
    } catch (e) {
      setAppErr(e instanceof Error ? e.message : 'Adaylar alınamadı');
      setAppLoaded(true);
    }
  }, []);

  const refreshApplicants = useCallback(async () => {
    if (selected) await loadApplicants(selected);
    await load();
  }, [selected, loadApplicants, load]);

  const setStatus = useCallback(
    async (a: Applicant, status: Extract<ApplicantStatus, 'kazandi' | 'kazanamadi' | 'kesin_kayit'>) => {
      setRowBusy(a.id);
      try {
        await api(`/admissions/applicants/${a.id}`, { method: 'PATCH', body: { status } });
        toast('Aday durumu güncellendi', {
          tone: 'ok',
          body: `${a.fullName} → ${APP_STATUS[status].label}`,
        });
        await refreshApplicants();
      } catch (e) {
        toast('Güncellenemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
      } finally {
        setRowBusy(null);
      }
    },
    [refreshApplicants],
  );

  const openNewApplicant = useCallback(() => {
    setNaName('');
    setNaNid('');
    setNaScore('');
    setOpenNewApp(true);
  }, []);

  const createApplicant = useCallback(async () => {
    if (!selected) return;
    if (!naName.trim() || !naNid.trim()) {
      toast('Eksik bilgi', { tone: 'err', body: 'Ad soyad ve T.C. kimlik no zorunludur.' });
      return;
    }
    const sc = naScore.trim() === '' ? undefined : Number(naScore);
    if (sc !== undefined && Number.isNaN(sc)) {
      toast('Geçersiz puan', { tone: 'err' });
      return;
    }
    setNaSaving(true);
    try {
      await api('/admissions/applicants', {
        method: 'POST',
        body: {
          applicationProgramId: selected.id,
          fullName: naName.trim(),
          nationalId: naNid.trim(),
          score: sc ?? null,
        },
      });
      toast('Aday eklendi', { tone: 'ok', body: naName.trim() });
      setOpenNewApp(false);
      await refreshApplicants();
    } catch (e) {
      toast('Aday eklenemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setNaSaving(false);
    }
  }, [selected, naName, naNid, naScore, refreshApplicants]);

  const stats = useMemo(() => {
    const totalQuota = programs.reduce((s, p) => s + p.quota, 0);
    const totalApplicants = programs.reduce((s, p) => s + p.applicantCount, 0);
    const openCount = programs.filter((p) => p.status === 'acik').length;
    return { totalQuota, totalApplicants, openCount };
  }, [programs]);

  const selectedProgram = catalog.find((c) => c.id === programId);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Başvuru Yönetimi"
        sub="Başvuru programları, kontenjanlar ve aday değerlendirme süreçleri."
        actions={
          <Button icon="grade" onClick={openNewPanel}>
            Yeni Başvuru Programı
          </Button>
        }
      />

      {!loaded ? (
        <Skeleton lines={6} />
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Başvuru programı', value: programs.length, icon: 'grade' },
              { label: 'Açık program', value: stats.openCount, icon: 'checkCircle', tone: 'ok' },
              { label: 'Toplam kontenjan', value: stats.totalQuota, icon: 'target' },
              { label: 'Toplam başvuran', value: stats.totalApplicants, icon: 'users' },
            ]}
          />

          <Card
            title="Başvuru Programları"
            icon="grade"
            hint="Adayları görüntülemek için bir programın satırındaki düğmeyi kullanın."
          >
            <DataTable
              rows={programs}
              csv
              csvName="basvuru-programlari"
              empty="Henüz başvuru programı açılmadı."
              columns={[
                {
                  key: 'programName',
                  header: 'Program',
                  value: (r) => r.programName,
                  render: (r) => (
                    <div>
                      <b>{r.programName}</b>
                      <div className="meta">
                        {r.year} · {r.term}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'type',
                  header: 'Tür',
                  value: (r) => TYPE_LABEL[r.type] ?? r.type,
                  render: (r) => <Badge tone="muted">{TYPE_LABEL[r.type] ?? r.type}</Badge>,
                },
                { key: 'quota', header: 'Kontenjan', num: true, value: (r) => r.quota },
                {
                  key: 'applicantCount',
                  header: 'Başvuran',
                  num: true,
                  value: (r) => r.applicantCount,
                },
                {
                  key: 'status',
                  header: 'Durum',
                  value: (r) => PROG_STATUS[r.status]?.label ?? r.status,
                  render: (r) => (
                    <Badge tone={PROG_STATUS[r.status]?.tone ?? 'muted'}>
                      {PROG_STATUS[r.status]?.label ?? r.status}
                    </Badge>
                  ),
                },
                {
                  key: 'action',
                  header: '',
                  sortable: false,
                  render: (r) => (
                    <Button variant="subtle" sm icon="users" onClick={() => loadApplicants(r)}>
                      Adaylar
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}

      {/* Yeni başvuru programı */}
      <Drawer open={openNew} onClose={() => setOpenNew(false)} title="Yeni Başvuru Programı">
        {catErr ? (
          <Alert tone="err">{catErr}</Alert>
        ) : catalog.length === 0 ? (
          <Skeleton lines={4} />
        ) : (
          <>
            <div className="field">
              <label>Program</label>
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                aria-label="Program"
              >
                <option value="">— program seçin —</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} · ` : ''}
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Başvuru Türü</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AppType)}
                aria-label="Başvuru Türü"
              >
                {TYPE_OPTS.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Yıl</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Dönem</label>
              <select value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Dönem">
                <option value="Güz">Güz</option>
                <option value="Bahar">Bahar</option>
                <option value="Yaz">Yaz</option>
              </select>
            </div>
            <div className="field">
              <label>Kontenjan</label>
              <input
                type="number"
                min={0}
                max={10000}
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Başvuru Başlangıcı</label>
              <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="field">
              <label>Başvuru Bitişi</label>
              <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
            <div className="field">
              <label>Asgari GNO (opsiyonel)</label>
              <input
                type="number"
                min={0}
                max={4}
                step={0.01}
                value={minGpa}
                onChange={(e) => setMinGpa(e.target.value)}
                placeholder="örn. 2.50"
              />
            </div>
            {selectedProgram && (
              <div className="info-box">
                <b>{selectedProgram.name}</b> · {TYPE_LABEL[type]} · {year} {term}
              </div>
            )}
            <Button block icon="check" onClick={createProgram} disabled={saving}>
              {saving ? 'Açılıyor…' : 'Programı Aç'}
            </Button>
          </>
        )}
      </Drawer>

      {/* Adaylar */}
      <Drawer
        open={selected != null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.programName} · Adaylar` : 'Adaylar'}
      >
        {selected && (
          <>
            <StatGrid
              stats={[
                { label: 'Tür', value: TYPE_LABEL[selected.type] ?? selected.type, icon: 'grade' },
                { label: 'Kontenjan', value: selected.quota, icon: 'target' },
                { label: 'Başvuran', value: selected.applicantCount, icon: 'users' },
              ]}
            />
            {(selected.startsOn || selected.endsOn) && (
              <div className="info-box" style={{ marginTop: 0 }}>
                Başvuru: <b>{fmtDate(selected.startsOn)}</b> — <b>{fmtDate(selected.endsOn)}</b>
                {selected.minGpa != null && <> · Asgari GNO {selected.minGpa}</>}
              </div>
            )}

            <div className="row" style={{ justifyContent: 'flex-end', margin: '12px 0' }}>
              <Button sm icon="user" onClick={openNewApplicant}>
                Yeni Aday
              </Button>
            </div>

            {appErr ? (
              <Alert tone="err">{appErr}</Alert>
            ) : !appLoaded ? (
              <Skeleton lines={4} />
            ) : applicants.length === 0 ? (
              <EmptyState
                icon="users"
                title="Aday bulunmuyor"
                sub="Bu programa henüz başvuru yapılmadı."
              />
            ) : (
              <DataTable
                rows={applicants}
                empty="Aday yok."
                columns={[
                  {
                    key: 'fullName',
                    header: 'Aday',
                    value: (r) => r.fullName,
                    render: (r) => (
                      <div>
                        <b>{r.fullName}</b>
                        <div className="meta">{r.nationalId}</div>
                      </div>
                    ),
                  },
                  {
                    key: 'score',
                    header: 'Puan',
                    num: true,
                    value: (r) => r.score ?? -1,
                    render: (r) =>
                      r.score != null ? r.score : <span className="muted">—</span>,
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    value: (r) => APP_STATUS[r.status]?.label ?? r.status,
                    render: (r) => (
                      <Badge tone={APP_STATUS[r.status]?.tone ?? 'muted'}>
                        {APP_STATUS[r.status]?.label ?? r.status}
                      </Badge>
                    ),
                  },
                  {
                    key: 'action',
                    header: '',
                    sortable: false,
                    render: (r) => (
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <Button
                          variant="ok"
                          sm
                          icon="check"
                          onClick={() => setStatus(r, 'kazandi')}
                          disabled={rowBusy === r.id}
                        >
                          Kazandı
                        </Button>
                        <Button
                          variant="danger"
                          sm
                          icon="x"
                          onClick={() => setStatus(r, 'kazanamadi')}
                          disabled={rowBusy === r.id}
                        >
                          Kazanamadı
                        </Button>
                        <Button
                          variant="subtle"
                          sm
                          icon="award"
                          onClick={() => setStatus(r, 'kesin_kayit')}
                          disabled={rowBusy === r.id}
                        >
                          Kesin Kayıt
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </>
        )}
      </Drawer>

      {/* Yeni aday */}
      <Drawer open={openNewApp} onClose={() => setOpenNewApp(false)} title="Yeni Aday">
        <div className="field">
          <label>Ad Soyad</label>
          <input value={naName} onChange={(e) => setNaName(e.target.value)} maxLength={120} />
        </div>
        <div className="field">
          <label>T.C. Kimlik No</label>
          <input value={naNid} onChange={(e) => setNaNid(e.target.value)} maxLength={11} />
        </div>
        <div className="field">
          <label>Puan (opsiyonel)</label>
          <input
            type="number"
            step={0.01}
            value={naScore}
            onChange={(e) => setNaScore(e.target.value)}
          />
        </div>
        <Button block icon="check" onClick={createApplicant} disabled={naSaving}>
          {naSaving ? 'Ekleniyor…' : 'Adayı Ekle'}
        </Button>
      </Drawer>
    </>
  );
}
