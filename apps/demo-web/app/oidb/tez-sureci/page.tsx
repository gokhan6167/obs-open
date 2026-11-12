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
  Donut,
  Meter,
  toast,
  fmtDate,
} from '@/app/ui';

/* ----------------------------- TİPLER ----------------------------- */
interface Thesis {
  id: string;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  title: string;
  advisorEmail: string | null;
  status: string;
  createdAt: string;
}
interface Advisor {
  userId: string;
  email: string;
  fullName: string;
}
interface Committee {
  id: string;
  memberUserId: string | null;
  memberName: string | null;
  memberEmail: string | null;
  role: string;
  createdAt: string;
}
interface Progress {
  id: string;
  period: string | null;
  meetingDate: string | null;
  result: string;
  note: string | null;
  createdAt: string;
}
interface Plagiarism {
  id: string;
  similarityPct: string | null;
  thresholdPct: string | null;
  passed: boolean | null;
  reportUrl: string | null;
  createdAt: string;
}
interface Defense {
  id: string;
  defenseDate: string | null;
  location: string | null;
  jury: unknown;
  result: string;
  decisionNo: string | null;
  note: string | null;
  createdAt: string;
}
interface Process {
  committee: Committee[];
  progress: Progress[];
  plagiarism: Plagiarism[];
  defense: Defense[];
}

type Tab = 'tik' | 'izleme' | 'intihal' | 'savunma';
type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted';

/* ----------------------------- SABİTLER ----------------------------- */
const THESIS_STATUS_TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  incelemede: 'İncelemede',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi',
  iptal: 'İptal',
};
const THESIS_TONE: Record<string, Tone> = {
  basvuruldu: 'warn',
  incelemede: 'info',
  onaylandi: 'ok',
  reddedildi: 'danger',
  iptal: 'danger',
};
const ROLE_TR: Record<string, string> = {
  danisman: 'Danışman',
  uye: 'Üye',
  baskan: 'Başkan',
};
const PROGRESS_TR: Record<string, string> = {
  basarili: 'Başarılı',
  basarisiz: 'Başarısız',
  beklemede: 'Beklemede',
};
const PROGRESS_TONE: Record<string, Tone> = {
  basarili: 'ok',
  basarisiz: 'danger',
  beklemede: 'warn',
};
const DEFENSE_TR: Record<string, string> = {
  beklemede: 'Beklemede',
  basarili: 'Başarılı',
  duzeltme: 'Düzeltme',
  red: 'Red',
};
const DEFENSE_TONE: Record<string, Tone> = {
  beklemede: 'info',
  basarili: 'ok',
  duzeltme: 'warn',
  red: 'danger',
};

const TABS: { value: Tab; label: string }[] = [
  { value: 'tik', label: 'TİK Üyeleri' },
  { value: 'izleme', label: 'İzleme Raporları' },
  { value: 'intihal', label: 'İntihal' },
  { value: 'savunma', label: 'Savunma' },
];

const memberLabel = (c: Committee): string => c.memberEmail ?? c.memberName ?? '—';
const juryText = (j: unknown): string =>
  Array.isArray(j) && j.length > 0 ? j.map((x) => String(x)).join(', ') : '—';
const msg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);

export default function TezSureciPage(): React.ReactElement {
  /* --- tez listesi --- */
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [scope, setScope] = useState<'onayli' | 'tumu'>('onayli');
  const [listErr, setListErr] = useState('');
  const [loading, setLoading] = useState(true);

  /* --- seçili tez süreci --- */
  const [selected, setSelected] = useState<Thesis | null>(null);
  const [proc, setProc] = useState<Process | null>(null);
  const [procErr, setProcErr] = useState('');
  const [procLoading, setProcLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('tik');
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  /* --- danışman/öğretim elemanı adayları (TİK için) --- */
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [advisorsErr, setAdvisorsErr] = useState('');

  /* --- form alanları --- */
  const [cMemberUserId, setCMemberUserId] = useState('');
  const [cMemberName, setCMemberName] = useState('');
  const [cRole, setCRole] = useState<'danisman' | 'uye' | 'baskan'>('uye');

  const [pPeriod, setPPeriod] = useState('');
  const [pMeetingDate, setPMeetingDate] = useState('');
  const [pResult, setPResult] = useState<'basarili' | 'basarisiz' | 'beklemede'>('basarili');
  const [pNote, setPNote] = useState('');

  const [iSimilarity, setISimilarity] = useState('');
  const [iThreshold, setIThreshold] = useState('20');
  const [iReportUrl, setIReportUrl] = useState('');

  const [dDate, setDDate] = useState('');
  const [dLocation, setDLocation] = useState('');
  const [dJury, setDJury] = useState('');
  const [dDecisionNo, setDDecisionNo] = useState('');

  const loadTheses = useCallback(async () => {
    const res = await api<{ items: Thesis[] }>('/thesis');
    setTheses(res.items);
  }, []);

  useEffect(() => {
    loadTheses()
      .catch((e) => setListErr(msg(e, 'Tez listesi alınamadı')))
      .finally(() => setLoading(false));
  }, [loadTheses]);

  const loadProcess = useCallback(async (thesisId: string) => {
    setProcLoading(true);
    setProcErr('');
    try {
      setProc(await api<Process>(`/thesis-process/${thesisId}`));
    } catch (e) {
      setProc(null);
      setProcErr(msg(e, 'Tez süreci alınamadı'));
    } finally {
      setProcLoading(false);
    }
  }, []);

  /* TİK sekmesine girildiğinde personel listesini bir kez çek. */
  useEffect(() => {
    if (tab !== 'tik' || advisors.length > 0) return;
    api<{ items: Advisor[] }>('/students/advisors')
      .then((r) => setAdvisors(r.items ?? []))
      .catch((e) => setAdvisorsErr(msg(e, 'Personel listesi alınamadı')));
  }, [tab, advisors.length]);

  const filtered = useMemo(
    () => theses.filter((t) => scope === 'tumu' || t.status === 'onaylandi'),
    [theses, scope],
  );

  /* Savunma ön koşulu: son intihal raporu geçmiş olmalı (backend 409 kuralı). */
  const lastPlagiarism = proc?.plagiarism[0] ?? null;
  const defenseReady = lastPlagiarism?.passed === true;

  function select(t: Thesis): void {
    setSelected(t);
    setTab('tik');
    setFormErr('');
    void loadProcess(t.id);
  }

  function switchTab(v: Tab): void {
    setTab(v);
    setFormErr('');
  }

  async function run(fn: () => Promise<void>): Promise<void> {
    setBusy(true);
    setFormErr('');
    try {
      await fn();
    } catch (e) {
      const m = msg(e, 'İşlem başarısız');
      setFormErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function addCommittee(): Promise<void> {
    if (!selected) return;
    if (!cMemberUserId && !cMemberName.trim()) {
      setFormErr('Personel seçin veya kurum dışı üye adını yazın.');
      return;
    }
    await run(async () => {
      await api(`/thesis-process/${selected.id}/committee`, {
        method: 'POST',
        body: {
          ...(cMemberUserId ? { memberUserId: cMemberUserId } : {}),
          ...(cMemberName.trim() ? { memberName: cMemberName.trim() } : {}),
          role: cRole,
        },
      });
      toast('TİK üyesi eklendi', { tone: 'ok', body: ROLE_TR[cRole] });
      setCMemberUserId('');
      setCMemberName('');
      setCRole('uye');
      await loadProcess(selected.id);
    });
  }

  async function addProgress(): Promise<void> {
    if (!selected) return;
    if (!pPeriod.trim()) {
      setFormErr('Dönem bilgisi zorunludur (örn. 2025-2026 Güz).');
      return;
    }
    await run(async () => {
      await api(`/thesis-process/${selected.id}/progress`, {
        method: 'POST',
        body: {
          period: pPeriod.trim(),
          ...(pMeetingDate ? { meetingDate: pMeetingDate } : {}),
          result: pResult,
          ...(pNote.trim() ? { note: pNote.trim() } : {}),
        },
      });
      toast('İzleme raporu eklendi', { tone: 'ok', body: `${pPeriod.trim()} · ${PROGRESS_TR[pResult]}` });
      setPPeriod('');
      setPMeetingDate('');
      setPResult('basarili');
      setPNote('');
      await loadProcess(selected.id);
    });
  }

  async function addPlagiarism(): Promise<void> {
    if (!selected) return;
    const sim = Number(iSimilarity);
    const thr = Number(iThreshold);
    if (iSimilarity === '' || Number.isNaN(sim) || sim < 0 || sim > 100) {
      setFormErr('Benzerlik oranı 0–100 arasında olmalıdır.');
      return;
    }
    if (iThreshold !== '' && (Number.isNaN(thr) || thr < 0 || thr > 100)) {
      setFormErr('Eşik oranı 0–100 arasında olmalıdır.');
      return;
    }
    await run(async () => {
      await api(`/thesis-process/${selected.id}/plagiarism`, {
        method: 'POST',
        body: {
          similarityPct: sim,
          ...(iThreshold !== '' ? { thresholdPct: thr } : {}),
          ...(iReportUrl.trim() ? { reportUrl: iReportUrl.trim() } : {}),
        },
      });
      toast('İntihal raporu eklendi', {
        tone: 'ok',
        body: `Benzerlik %${sim} · ${sim <= (iThreshold === '' ? 20 : thr) ? 'Geçti' : 'Eşik aşıldı'}`,
      });
      setISimilarity('');
      setIReportUrl('');
      await loadProcess(selected.id);
    });
  }

  async function planDefense(): Promise<void> {
    if (!selected) return;
    if (!dDate) {
      setFormErr('Savunma tarihi zorunludur.');
      return;
    }
    const jury = dJury
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await run(async () => {
      await api(`/thesis-process/${selected.id}/defense`, {
        method: 'POST',
        body: {
          defenseDate: dDate,
          ...(dLocation.trim() ? { location: dLocation.trim() } : {}),
          ...(jury.length > 0 ? { jury } : {}),
          ...(dDecisionNo.trim() ? { decisionNo: dDecisionNo.trim() } : {}),
        },
      });
      toast('Savunma planlandı', { tone: 'ok', body: fmtDate(dDate) });
      setDDate('');
      setDLocation('');
      setDJury('');
      setDDecisionNo('');
      await loadProcess(selected.id);
    });
  }

  async function decideDefense(d: Defense, result: 'basarili' | 'duzeltme' | 'red'): Promise<void> {
    if (!selected) return;
    await run(async () => {
      await api(`/thesis-process/defense/${d.id}`, { method: 'PATCH', body: { result } });
      toast('Savunma sonucu kaydedildi', {
        tone: result === 'red' ? 'err' : 'ok',
        body: `${fmtDate(d.defenseDate)} → ${DEFENSE_TR[result]}`,
      });
      await loadProcess(selected.id);
    });
  }

  return (
    <>
      <PageHeader
        title="Tez Süreci"
        sub="Lisansüstü tez izleme komitesi (TİK), izleme raporları, intihal denetimi ve savunma süreçlerini tek ekrandan yürütün."
      />

      <Card
        title="Tez seçimi"
        icon="fileText"
        hint="Süreç işlemleri için önce bir tez seçin. Süreç genellikle konusu onaylanmış tezler üzerinden yürütülür."
      >
        {listErr && <Alert tone="err">{listErr}</Alert>}
        <div className="row" style={{ gap: 16, marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Kapsam</label>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'onayli', label: 'Onaylı tezler' },
                { value: 'tumu', label: 'Tümü' },
              ]}
            />
          </div>
        </div>
        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable<Thesis>
            rows={filtered}
            search
            pageSize={10}
            empty={
              <EmptyState
                icon="fileText"
                title="Tez kaydı bulunamadı"
                sub="Kapsamı 'Tümü' yaparak onay bekleyen tezleri de görebilirsiniz."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci',
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
              { key: 'title', header: 'Başlık', value: (r) => r.title },
              {
                key: 'advisor',
                header: 'Danışman',
                value: (r) => r.advisorEmail ?? '—',
                render: (r) => r.advisorEmail ?? <span className="muted">—</span>,
              },
              {
                key: 'status',
                header: 'Durum',
                value: (r) => THESIS_STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={THESIS_TONE[r.status] ?? 'muted'}>
                    {THESIS_STATUS_TR[r.status] ?? r.status}
                  </Badge>
                ),
              },
              {
                key: 'action',
                header: 'İşlem',
                sortable: false,
                render: (r) => (
                  <Button
                    variant={selected?.id === r.id ? 'primary' : 'subtle'}
                    sm
                    icon="layers"
                    onClick={() => select(r)}
                  >
                    {selected?.id === r.id ? 'Seçili' : 'Süreç'}
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {!selected ? (
        <Card>
          <EmptyState
            icon="target"
            title="Tez seçilmedi"
            sub="Yukarıdaki listeden bir tez seçtiğinizde TİK, izleme, intihal ve savunma sekmeleri açılır."
          />
        </Card>
      ) : (
        <>
          <Card
            title={selected.title}
            icon="award"
            hint={`${selected.studentNo} · ${selected.studentEmail}`}
            actions={
              <Button
                variant="subtle"
                sm
                icon="refresh"
                disabled={procLoading}
                onClick={() => void loadProcess(selected.id)}
              >
                Yenile
              </Button>
            }
          >
            {procErr && <Alert tone="err">{procErr}</Alert>}
            {procLoading ? (
              <Skeleton lines={4} />
            ) : proc ? (
              <>
                <StatGrid
                  stats={[
                    { label: 'TİK üyesi', value: proc.committee.length, icon: 'users' },
                    { label: 'İzleme raporu', value: proc.progress.length, icon: 'activity' },
                    {
                      label: 'Son benzerlik',
                      value: lastPlagiarism ? `%${Number(lastPlagiarism.similarityPct ?? 0)}` : '—',
                      icon: 'shield',
                      tone: lastPlagiarism ? (lastPlagiarism.passed ? 'ok' : 'danger') : undefined,
                    },
                    {
                      label: 'Savunma',
                      value: proc.defense[0]
                        ? (DEFENSE_TR[proc.defense[0].result] ?? proc.defense[0].result)
                        : 'Planlanmadı',
                      icon: 'award',
                      tone: proc.defense[0]?.result === 'basarili' ? 'ok' : undefined,
                    },
                  ]}
                />
                <div style={{ marginTop: 4 }}>
                  <Segmented value={tab} onChange={switchTab} options={TABS} />
                </div>
              </>
            ) : null}
          </Card>

          {proc && !procLoading && (
            <>
              {/* --------------------------- TİK ÜYELERİ --------------------------- */}
              {tab === 'tik' && (
                <>
                  <Card title="TİK üyeleri" icon="users">
                    {proc.committee.length === 0 ? (
                      <EmptyState
                        icon="users"
                        title="TİK üyesi eklenmemiş"
                        sub="Tez izleme komitesi genelde danışman, bir başkan ve üyelerden oluşur."
                      />
                    ) : (
                      <DataTable<Committee>
                        rows={proc.committee}
                        search={false}
                        columns={[
                          {
                            key: 'member',
                            header: 'Üye',
                            value: (r) => memberLabel(r),
                            render: (r) => (
                              <div>
                                <b>{memberLabel(r)}</b>
                                {!r.memberUserId && (
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    Kurum dışı
                                  </div>
                                )}
                              </div>
                            ),
                          },
                          {
                            key: 'role',
                            header: 'Görev',
                            value: (r) => ROLE_TR[r.role] ?? r.role,
                            render: (r) => (
                              <Badge tone={r.role === 'danisman' ? 'ok' : r.role === 'baskan' ? 'info' : 'muted'}>
                                {ROLE_TR[r.role] ?? r.role}
                              </Badge>
                            ),
                          },
                          {
                            key: 'createdAt',
                            header: 'Eklendi',
                            value: (r) => r.createdAt,
                            render: (r) => fmtDate(r.createdAt),
                          },
                        ]}
                      />
                    )}
                  </Card>

                  <Card title="TİK üyesi ekle" icon="user">
                    {formErr && <Alert tone="err">{formErr}</Alert>}
                    {advisorsErr && <Alert tone="warn">{advisorsErr}</Alert>}
                    <div className="field">
                      <label>Kurum içi personel</label>
                      <select
                        value={cMemberUserId}
                        onChange={(e) => setCMemberUserId(e.target.value)}
                      >
                        <option value="">— Seçilmedi (kurum dışı üye) —</option>
                        {advisors.map((a) => (
                          <option key={a.userId} value={a.userId}>
                            {a.fullName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Kurum dışı üye adı</label>
                      <input
                        value={cMemberName}
                        onChange={(e) => setCMemberName(e.target.value)}
                        placeholder="Prof. Dr. Ad Soyad (başka üniversiteden)"
                        maxLength={200}
                      />
                      <div className="hint-sm">
                        Personel seçilmediğinde bu alan kullanılır; ikisinden en az biri gereklidir.
                      </div>
                    </div>
                    <div className="field">
                      <label>Görev</label>
                      <select
                        value={cRole}
                        onChange={(e) =>
                          setCRole(e.target.value as 'danisman' | 'uye' | 'baskan')
                        }
                      >
                        <option value="danisman">Danışman</option>
                        <option value="baskan">Başkan</option>
                        <option value="uye">Üye</option>
                      </select>
                    </div>
                    <Button icon="check" disabled={busy} onClick={() => void addCommittee()}>
                      Üye ekle
                    </Button>
                  </Card>
                </>
              )}

              {/* --------------------------- İZLEME RAPORLARI --------------------------- */}
              {tab === 'izleme' && (
                <>
                  <Card title="TİK izleme raporları" icon="activity">
                    {proc.progress.length === 0 ? (
                      <EmptyState
                        icon="activity"
                        title="İzleme raporu yok"
                        sub="Her dönem sonunda TİK toplantı sonucu buraya işlenir."
                      />
                    ) : (
                      <DataTable<Progress>
                        rows={proc.progress}
                        search={false}
                        columns={[
                          {
                            key: 'period',
                            header: 'Dönem',
                            value: (r) => r.period ?? '—',
                            render: (r) => <b>{r.period ?? '—'}</b>,
                          },
                          {
                            key: 'meetingDate',
                            header: 'Toplantı',
                            value: (r) => r.meetingDate ?? '',
                            render: (r) => fmtDate(r.meetingDate),
                          },
                          {
                            key: 'result',
                            header: 'Sonuç',
                            value: (r) => PROGRESS_TR[r.result] ?? r.result,
                            render: (r) => (
                              <Badge tone={PROGRESS_TONE[r.result] ?? 'muted'}>
                                {PROGRESS_TR[r.result] ?? r.result}
                              </Badge>
                            ),
                          },
                          {
                            key: 'note',
                            header: 'Not',
                            value: (r) => r.note ?? '',
                            render: (r) => r.note ?? <span className="muted">—</span>,
                          },
                        ]}
                      />
                    )}
                  </Card>

                  <Card title="İzleme raporu ekle" icon="edit">
                    {formErr && <Alert tone="err">{formErr}</Alert>}
                    <div className="field">
                      <label>Dönem</label>
                      <input
                        value={pPeriod}
                        onChange={(e) => setPPeriod(e.target.value)}
                        placeholder="2025-2026 Güz"
                        maxLength={60}
                      />
                    </div>
                    <div className="field">
                      <label>Toplantı tarihi</label>
                      <input
                        type="date"
                        value={pMeetingDate}
                        onChange={(e) => setPMeetingDate(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Sonuç</label>
                      <select
                        value={pResult}
                        onChange={(e) =>
                          setPResult(e.target.value as 'basarili' | 'basarisiz' | 'beklemede')
                        }
                      >
                        <option value="basarili">Başarılı</option>
                        <option value="basarisiz">Başarısız</option>
                        <option value="beklemede">Beklemede</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Not</label>
                      <textarea
                        value={pNote}
                        onChange={(e) => setPNote(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder="Komite değerlendirmesi (isteğe bağlı)"
                      />
                    </div>
                    <Button icon="check" disabled={busy} onClick={() => void addProgress()}>
                      Raporu kaydet
                    </Button>
                  </Card>
                </>
              )}

              {/* --------------------------- İNTİHAL --------------------------- */}
              {tab === 'intihal' && (
                <>
                  <Card title="İntihal raporları" icon="shield">
                    {proc.plagiarism.length === 0 ? (
                      <EmptyState
                        icon="shield"
                        title="İntihal raporu yok"
                        sub="Savunma planlayabilmek için eşiği aşmayan bir intihal raporu gereklidir."
                      />
                    ) : (
                      <>
                        {lastPlagiarism && (
                          <div className="row" style={{ gap: 18, marginBottom: 16 }}>
                            <Donut
                              value={Number(lastPlagiarism.similarityPct ?? 0)}
                              color={lastPlagiarism.passed ? 'var(--ok)' : 'var(--danger)'}
                            />
                            <div>
                              <div style={{ fontWeight: 700 }}>Son rapor benzerlik oranı</div>
                              <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                                Eşik %{Number(lastPlagiarism.thresholdPct ?? 0)} ·{' '}
                                {fmtDate(lastPlagiarism.createdAt)}
                              </div>
                              <div style={{ marginTop: 6 }}>
                                <Badge tone={lastPlagiarism.passed ? 'ok' : 'danger'}>
                                  {lastPlagiarism.passed ? 'Geçti' : 'Eşik aşıldı'}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        )}
                        <DataTable<Plagiarism>
                          rows={proc.plagiarism}
                          search={false}
                          columns={[
                            {
                              key: 'createdAt',
                              header: 'Tarih',
                              value: (r) => r.createdAt,
                              render: (r) => fmtDate(r.createdAt),
                            },
                            {
                              key: 'similarityPct',
                              header: 'Benzerlik',
                              num: true,
                              value: (r) => Number(r.similarityPct ?? 0),
                              render: (r) => (
                                <Meter
                                  value={Number(r.similarityPct ?? 0)}
                                  label={`%${Number(r.similarityPct ?? 0)}`}
                                />
                              ),
                            },
                            {
                              key: 'thresholdPct',
                              header: 'Eşik',
                              num: true,
                              value: (r) => Number(r.thresholdPct ?? 0),
                              render: (r) => `%${Number(r.thresholdPct ?? 0)}`,
                            },
                            {
                              key: 'passed',
                              header: 'Durum',
                              value: (r) => (r.passed ? 'Geçti' : 'Kaldı'),
                              render: (r) => (
                                <Badge tone={r.passed ? 'ok' : 'danger'}>
                                  {r.passed ? 'Geçti' : 'Eşik aşıldı'}
                                </Badge>
                              ),
                            },
                            {
                              key: 'reportUrl',
                              header: 'Rapor',
                              sortable: false,
                              value: (r) => r.reportUrl ?? '',
                              render: (r) =>
                                // Yalnızca http(s) render edilir (javascript:/data: XSS koruması).
                                r.reportUrl && /^https?:\/\//i.test(r.reportUrl) ? (
                                  <a href={r.reportUrl} target="_blank" rel="noreferrer">
                                    Raporu aç
                                  </a>
                                ) : (
                                  <span className="muted">—</span>
                                ),
                            },
                          ]}
                        />
                      </>
                    )}
                  </Card>

                  <Card
                    title="İntihal raporu ekle"
                    icon="upload"
                    hint="Geçti/kaldı kararı benzerlik oranı ile eşik karşılaştırılarak otomatik belirlenir."
                  >
                    {formErr && <Alert tone="err">{formErr}</Alert>}
                    <div className="field">
                      <label>Benzerlik oranı (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={iSimilarity}
                        onChange={(e) => setISimilarity(e.target.value)}
                        placeholder="12.5"
                      />
                    </div>
                    <div className="field">
                      <label>Eşik (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={iThreshold}
                        onChange={(e) => setIThreshold(e.target.value)}
                      />
                      <div className="hint-sm">Boş bırakılırsa kurum varsayılanı (%20) uygulanır.</div>
                    </div>
                    <div className="field">
                      <label>Rapor bağlantısı</label>
                      <input
                        value={iReportUrl}
                        onChange={(e) => setIReportUrl(e.target.value)}
                        placeholder="https://..."
                        maxLength={500}
                      />
                    </div>
                    <Button icon="check" disabled={busy} onClick={() => void addPlagiarism()}>
                      Raporu kaydet
                    </Button>
                  </Card>
                </>
              )}

              {/* --------------------------- SAVUNMA --------------------------- */}
              {tab === 'savunma' && (
                <>
                  <Card title="Savunma kayıtları" icon="award">
                    {proc.defense.length === 0 ? (
                      <EmptyState
                        icon="award"
                        title="Savunma planlanmamış"
                        sub="Jüri ve tarih belirlendikten sonra savunma kaydı oluşturun."
                      />
                    ) : (
                      <DataTable<Defense>
                        rows={proc.defense}
                        search={false}
                        columns={[
                          {
                            key: 'defenseDate',
                            header: 'Tarih',
                            value: (r) => r.defenseDate ?? '',
                            render: (r) => <b>{fmtDate(r.defenseDate)}</b>,
                          },
                          {
                            key: 'location',
                            header: 'Yer',
                            value: (r) => r.location ?? '',
                            render: (r) => r.location ?? <span className="muted">—</span>,
                          },
                          {
                            key: 'jury',
                            header: 'Jüri',
                            sortable: false,
                            value: (r) => juryText(r.jury),
                            render: (r) => juryText(r.jury),
                          },
                          {
                            key: 'decisionNo',
                            header: 'Karar no',
                            value: (r) => r.decisionNo ?? '',
                            render: (r) => r.decisionNo ?? <span className="muted">—</span>,
                          },
                          {
                            key: 'result',
                            header: 'Sonuç',
                            value: (r) => DEFENSE_TR[r.result] ?? r.result,
                            render: (r) => (
                              <Badge tone={DEFENSE_TONE[r.result] ?? 'muted'}>
                                {DEFENSE_TR[r.result] ?? r.result}
                              </Badge>
                            ),
                          },
                          {
                            key: 'action',
                            header: 'Sonuç gir',
                            sortable: false,
                            render: (r) =>
                              r.result === 'beklemede' ? (
                                <div className="row" style={{ gap: 6 }}>
                                  <Button
                                    variant="ok"
                                    sm
                                    disabled={busy}
                                    onClick={() => void decideDefense(r, 'basarili')}
                                  >
                                    Başarılı
                                  </Button>
                                  <Button
                                    variant="subtle"
                                    sm
                                    disabled={busy}
                                    onClick={() => void decideDefense(r, 'duzeltme')}
                                  >
                                    Düzeltme
                                  </Button>
                                  <Button
                                    variant="danger"
                                    sm
                                    disabled={busy}
                                    onClick={() => void decideDefense(r, 'red')}
                                  >
                                    Red
                                  </Button>
                                </div>
                              ) : (
                                <span className="muted">Sonuçlandı</span>
                              ),
                          },
                        ]}
                      />
                    )}
                  </Card>

                  <Card title="Savunma planla" icon="calendar">
                    {formErr && (
                      <Alert tone="err">
                        {formErr}
                        {!defenseReady && (
                          <div style={{ marginTop: 6 }}>
                            Savunma planlamak için önce <b>İntihal</b> sekmesinden eşiği aşmayan bir
                            intihal raporu eklemelisiniz. Rapor yoksa veya son rapor eşiği aşıyorsa
                            sistem savunma kaydı oluşturmaz.
                          </div>
                        )}
                      </Alert>
                    )}
                    {!defenseReady && !formErr && (
                      <Alert tone="warn">
                        {lastPlagiarism
                          ? `Son intihal raporunda benzerlik %${Number(lastPlagiarism.similarityPct ?? 0)} ile eşiği aşıyor. Eşiği sağlayan yeni bir rapor eklenmeden savunma planlanamaz.`
                          : 'Bu tez için henüz intihal raporu yok. İntihal sekmesinden eşiği sağlayan bir rapor eklenmeden savunma planlanamaz.'}
                      </Alert>
                    )}
                    <div className="field">
                      <label>Savunma tarihi</label>
                      <input type="date" value={dDate} onChange={(e) => setDDate(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Yer</label>
                      <input
                        value={dLocation}
                        onChange={(e) => setDLocation(e.target.value)}
                        placeholder="Fen Bilimleri Enstitüsü Seminer Salonu"
                        maxLength={200}
                      />
                    </div>
                    <div className="field">
                      <label>Jüri</label>
                      <input
                        value={dJury}
                        onChange={(e) => setDJury(e.target.value)}
                        placeholder="Prof. Dr. A Yılmaz, Doç. Dr. B Kaya, Dr. Öğr. Üyesi C Demir"
                      />
                      <div className="hint-sm">Üye adlarını virgülle ayırarak yazın (en fazla 20 üye).</div>
                    </div>
                    <div className="field">
                      <label>Karar no</label>
                      <input
                        value={dDecisionNo}
                        onChange={(e) => setDDecisionNo(e.target.value)}
                        placeholder="EYK 2026/14"
                        maxLength={120}
                      />
                    </div>
                    <Button
                      icon="calendar"
                      disabled={busy || !defenseReady}
                      onClick={() => void planDefense()}
                    >
                      Savunmayı planla
                    </Button>
                  </Card>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
