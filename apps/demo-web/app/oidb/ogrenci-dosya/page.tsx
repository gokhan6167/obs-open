'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  DataTable,
  Badge,
  Button,
  Alert,
  Skeleton,
  EmptyState,
  Segmented,
  toast,
  fmtDate,
} from '@/app/ui';

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | null;
}

interface LeaveRow {
  id: string;
  type: string;
  startsOn: string | null;
  endsOn: string | null;
  decisionNo: string | null;
  decisionDate: string | null;
  reason: string | null;
  createdAt: string;
}

interface MilitaryRow {
  id: string;
  status: string;
  deferralDate: string | null;
  note: string | null;
  createdAt: string;
}

interface DocumentRow {
  id: string;
  kind: string;
  description: string | null;
  docNo: string | null;
  receivedOn: string | null;
  hasOriginal: boolean;
  createdAt: string;
}

interface PriorEducationRow {
  id: string;
  schoolName: string;
  degree: string | null;
  graduationYear: number | null;
  gpa: number | null;
  note: string | null;
  createdAt: string;
}

interface AwardRow {
  id: string;
  title: string;
  awardDate: string | null;
  description: string | null;
  createdAt: string;
}

interface StudentFile {
  leaves: LeaveRow[];
  military: MilitaryRow[];
  documents: DocumentRow[];
  priorEducations: PriorEducationRow[];
  awards: AwardRow[];
}

type Tab = 'leaves' | 'military' | 'documents' | 'priorEducations' | 'awards';
type LeaveType = 'mazeretli' | 'raporlu' | 'gorevli' | 'kayit_dondurma';
type MilitaryStatus = 'tecilli' | 'tecilsiz' | 'muaf' | 'tamamlandi';

const TABS: { value: Tab; label: string }[] = [
  { value: 'leaves', label: 'İzinler' },
  { value: 'military', label: 'Askerlik' },
  { value: 'documents', label: 'Gelen belgeler' },
  { value: 'priorEducations', label: 'Geçmiş eğitim' },
  { value: 'awards', label: 'Ödüller' },
];

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'mazeretli', label: 'Mazeretli' },
  { value: 'raporlu', label: 'Raporlu' },
  { value: 'gorevli', label: 'Görevli' },
  { value: 'kayit_dondurma', label: 'Kayıt dondurma' },
];

const MILITARY_STATUSES: { value: MilitaryStatus; label: string }[] = [
  { value: 'tecilli', label: 'Tecilli' },
  { value: 'tecilsiz', label: 'Tecilsiz' },
  { value: 'muaf', label: 'Muaf' },
  { value: 'tamamlandi', label: 'Tamamlandı' },
];

const leaveLabel = (v: string): string => LEAVE_TYPES.find((x) => x.value === v)?.label ?? v;
const militaryLabel = (v: string): string =>
  MILITARY_STATUSES.find((x) => x.value === v)?.label ?? v;

function leaveTone(v: string): 'info' | 'warn' | 'ok' {
  if (v === 'kayit_dondurma') return 'warn';
  if (v === 'raporlu') return 'info';
  return 'ok';
}

function militaryTone(v: string): 'ok' | 'warn' | 'muted' {
  if (v === 'tecilsiz') return 'warn';
  if (v === 'tamamlandi' || v === 'muaf') return 'muted';
  return 'ok';
}

const dash = (v: string | null): React.ReactNode => (v ? v : <span className="muted">—</span>);

export default function OgrenciDosyaPage(): React.ReactElement {
  // Öğrenci arama + seçim.
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');
  const [picked, setPicked] = useState<StudentHit | null>(null);

  // Dosya.
  const [file, setFile] = useState<StudentFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileErr, setFileErr] = useState('');
  const [tab, setTab] = useState<Tab>('leaves');

  // İzin formu.
  const [lType, setLType] = useState<LeaveType>('mazeretli');
  const [lStartsOn, setLStartsOn] = useState('');
  const [lEndsOn, setLEndsOn] = useState('');
  const [lDecisionNo, setLDecisionNo] = useState('');
  const [lDecisionDate, setLDecisionDate] = useState('');
  const [lReason, setLReason] = useState('');

  // Askerlik formu.
  const [mStatus, setMStatus] = useState<MilitaryStatus>('tecilli');
  const [mDeferralDate, setMDeferralDate] = useState('');
  const [mNote, setMNote] = useState('');

  // Belge formu.
  const [dKind, setDKind] = useState('');
  const [dDescription, setDDescription] = useState('');
  const [dDocNo, setDDocNo] = useState('');
  const [dReceivedOn, setDReceivedOn] = useState('');
  const [dHasOriginal, setDHasOriginal] = useState(false);

  // Geçmiş eğitim formu.
  const [pSchoolName, setPSchoolName] = useState('');
  const [pDegree, setPDegree] = useState('');
  const [pGraduationYear, setPGraduationYear] = useState('');
  const [pGpa, setPGpa] = useState('');
  const [pNote, setPNote] = useState('');

  // Ödül formu.
  const [aTitle, setATitle] = useState('');
  const [aAwardDate, setAAwardDate] = useState('');
  const [aDescription, setADescription] = useState('');

  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const loadFile = useCallback(async (studentId: string) => {
    setLoading(true);
    setFileErr('');
    try {
      const res = await api<StudentFile>(`/student-file/${studentId}`);
      setFile({
        leaves: res.leaves ?? [],
        military: res.military ?? [],
        documents: res.documents ?? [],
        priorEducations: res.priorEducations ?? [],
        awards: res.awards ?? [],
      });
    } catch (e) {
      setFileErr(e instanceof Error ? e.message : 'Dosya yüklenemedi');
      setFile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (picked) void loadFile(picked.id);
    else setFile(null);
  }, [picked, loadFile]);

  async function search(): Promise<void> {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setSearchErr('');
    try {
      const res = await api<{ items: StudentHit[] }>(
        `/portal/students?q=${encodeURIComponent(term)}`,
      );
      setHits(res.items ?? []);
    } catch (e) {
      setSearchErr(e instanceof Error ? e.message : 'Arama başarısız');
    } finally {
      setSearching(false);
    }
  }

  function resetForms(): void {
    setLType('mazeretli');
    setLStartsOn('');
    setLEndsOn('');
    setLDecisionNo('');
    setLDecisionDate('');
    setLReason('');
    setMStatus('tecilli');
    setMDeferralDate('');
    setMNote('');
    setDKind('');
    setDDescription('');
    setDDocNo('');
    setDReceivedOn('');
    setDHasOriginal(false);
    setPSchoolName('');
    setPDegree('');
    setPGraduationYear('');
    setPGpa('');
    setPNote('');
    setATitle('');
    setAAwardDate('');
    setADescription('');
    setFormErr('');
  }

  async function submitLeave(): Promise<void> {
    if (!picked) return;
    setSaving(true);
    setFormErr('');
    try {
      await api(`/student-file/${picked.id}/leave`, {
        method: 'POST',
        body: {
          type: lType,
          ...(lStartsOn ? { startsOn: lStartsOn } : {}),
          ...(lEndsOn ? { endsOn: lEndsOn } : {}),
          ...(lDecisionNo.trim() ? { decisionNo: lDecisionNo.trim() } : {}),
          ...(lDecisionDate ? { decisionDate: lDecisionDate } : {}),
          ...(lReason.trim() ? { reason: lReason.trim() } : {}),
        },
      });
      toast('İzin kaydedildi', { tone: 'ok', body: leaveLabel(lType) });
      resetForms();
      await loadFile(picked.id);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  async function submitMilitary(): Promise<void> {
    if (!picked) return;
    setSaving(true);
    setFormErr('');
    try {
      await api(`/student-file/${picked.id}/military`, {
        method: 'POST',
        body: {
          status: mStatus,
          ...(mDeferralDate ? { deferralDate: mDeferralDate } : {}),
          ...(mNote.trim() ? { note: mNote.trim() } : {}),
        },
      });
      toast('Askerlik kaydı eklendi', { tone: 'ok', body: militaryLabel(mStatus) });
      resetForms();
      await loadFile(picked.id);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  async function submitDocument(): Promise<void> {
    if (!picked) return;
    if (!dKind.trim()) {
      setFormErr('Belge türü zorunludur.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api(`/student-file/${picked.id}/document`, {
        method: 'POST',
        body: {
          kind: dKind.trim(),
          ...(dDescription.trim() ? { description: dDescription.trim() } : {}),
          ...(dDocNo.trim() ? { docNo: dDocNo.trim() } : {}),
          ...(dReceivedOn ? { receivedOn: dReceivedOn } : {}),
          hasOriginal: dHasOriginal,
        },
      });
      toast('Belge kaydedildi', { tone: 'ok', body: dKind.trim() });
      resetForms();
      await loadFile(picked.id);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  async function submitPriorEducation(): Promise<void> {
    if (!picked) return;
    if (!pSchoolName.trim()) {
      setFormErr('Okul adı zorunludur.');
      return;
    }
    const year = pGraduationYear.trim() ? Number(pGraduationYear.trim()) : undefined;
    const gpa = pGpa.trim() ? Number(pGpa.trim()) : undefined;
    setSaving(true);
    setFormErr('');
    try {
      await api(`/student-file/${picked.id}/prior-education`, {
        method: 'POST',
        body: {
          schoolName: pSchoolName.trim(),
          ...(pDegree.trim() ? { degree: pDegree.trim() } : {}),
          ...(year !== undefined ? { graduationYear: year } : {}),
          ...(gpa !== undefined ? { gpa } : {}),
          ...(pNote.trim() ? { note: pNote.trim() } : {}),
        },
      });
      toast('Geçmiş eğitim kaydedildi', { tone: 'ok', body: pSchoolName.trim() });
      resetForms();
      await loadFile(picked.id);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  async function submitAward(): Promise<void> {
    if (!picked) return;
    if (!aTitle.trim()) {
      setFormErr('Ödül başlığı zorunludur.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api(`/student-file/${picked.id}/award`, {
        method: 'POST',
        body: {
          title: aTitle.trim(),
          ...(aAwardDate ? { awardDate: aAwardDate } : {}),
          ...(aDescription.trim() ? { description: aDescription.trim() } : {}),
        },
      });
      toast('Ödül kaydedildi', { tone: 'ok', body: aTitle.trim() });
      resetForms();
      await loadFile(picked.id);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  const leaves = useMemo(() => file?.leaves ?? [], [file]);
  const military = useMemo(() => file?.military ?? [], [file]);
  const documents = useMemo(() => file?.documents ?? [], [file]);
  const priorEducations = useMemo(() => file?.priorEducations ?? [], [file]);
  const awards = useMemo(() => file?.awards ?? [], [file]);

  return (
    <>
      <PageHeader
        title="Öğrenci dosyası"
        sub="Öğrenciyi arayıp seçin; izin, askerlik ve gelen belge kayıtlarını görüntüleyip ekleyin."
      />

      <Card title="Öğrenci seç" icon="search">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 240px', marginBottom: 0 }}>
              <label>Öğrenci no / ad ile ara</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="20210001 veya ad"
              />
            </div>
            <Button variant="ghost" type="submit" icon="search" disabled={searching}>
              {searching ? 'Aranıyor…' : 'Ara'}
            </Button>
          </div>
        </form>

        {searchErr && (
          <div style={{ marginTop: 12 }}>
            <Alert tone="err">{searchErr}</Alert>
          </div>
        )}

        {picked ? (
          <div className="info-box" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
              <span>
                <b>{picked.studentNo}</b> · {picked.fullName}
                <span className="muted"> · {picked.programName}</span>
              </span>
              <Button variant="ghost" sm icon="refresh" onClick={() => setPicked(null)}>
                Değiştir
              </Button>
            </div>
          </div>
        ) : (
          hits.length > 0 && (
            <table style={{ marginTop: 12 }}>
              <tbody>
                {hits.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <b>{h.studentNo}</b>
                    </td>
                    <td>{h.fullName}</td>
                    <td className="muted">{h.programName}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="ghost" sm icon="check" onClick={() => setPicked(h)}>
                        Seç
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </Card>

      {picked && (
        <Card
          title="Dosya"
          icon="file"
          actions={<Segmented value={tab} onChange={setTab} options={TABS} />}
        >
          {fileErr && <Alert tone="err">{fileErr}</Alert>}
          {loading ? (
            <Skeleton lines={8} />
          ) : (
            <>
              {tab === 'leaves' && (
                <>
                  <DataTable<LeaveRow>
                    rows={leaves}
                    search
                    csv
                    csvName="ogrenci-dosya-izinler"
                    empty={
                      <EmptyState
                        icon="file"
                        title="İzin kaydı yok"
                        sub="Aşağıdaki formdan yeni izin ekleyebilirsiniz."
                      />
                    }
                    columns={[
                      {
                        key: 'type',
                        header: 'Tür',
                        sortable: true,
                        value: (r) => r.type,
                        render: (r) => <Badge tone={leaveTone(r.type)}>{leaveLabel(r.type)}</Badge>,
                      },
                      {
                        key: 'startsOn',
                        header: 'Başlangıç',
                        sortable: true,
                        value: (r) => r.startsOn ?? '',
                        render: (r) => (r.startsOn ? fmtDate(r.startsOn) : dash(null)),
                      },
                      {
                        key: 'endsOn',
                        header: 'Bitiş',
                        sortable: true,
                        value: (r) => r.endsOn ?? '',
                        render: (r) => (r.endsOn ? fmtDate(r.endsOn) : dash(null)),
                      },
                      {
                        key: 'decisionNo',
                        header: 'Karar No',
                        sortable: true,
                        value: (r) => r.decisionNo ?? '',
                        render: (r) => dash(r.decisionNo),
                      },
                      {
                        key: 'decisionDate',
                        header: 'Karar Tarihi',
                        sortable: true,
                        value: (r) => r.decisionDate ?? '',
                        render: (r) => (r.decisionDate ? fmtDate(r.decisionDate) : dash(null)),
                      },
                      {
                        key: 'reason',
                        header: 'Gerekçe',
                        value: (r) => r.reason ?? '',
                        render: (r) => dash(r.reason),
                      },
                    ]}
                  />

                  <h2>Yeni izin</h2>
                  {formErr && <Alert tone="err">{formErr}</Alert>}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitLeave();
                    }}
                  >
                    <div className="field">
                      <label>Tür</label>
                      <select
                        value={lType}
                        onChange={(e) => setLType(e.target.value as LeaveType)}
                      >
                        {LEAVE_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="row" style={{ alignItems: 'flex-end' }}>
                      <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                        <label>Başlangıç</label>
                        <input
                          type="date"
                          value={lStartsOn}
                          onChange={(e) => setLStartsOn(e.target.value)}
                        />
                      </div>
                      <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                        <label>Bitiş</label>
                        <input
                          type="date"
                          value={lEndsOn}
                          onChange={(e) => setLEndsOn(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
                      <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                        <label>Karar no</label>
                        <input
                          value={lDecisionNo}
                          onChange={(e) => setLDecisionNo(e.target.value)}
                          placeholder="YK-2025/12"
                        />
                      </div>
                      <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                        <label>Karar tarihi</label>
                        <input
                          type="date"
                          value={lDecisionDate}
                          onChange={(e) => setLDecisionDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="field" style={{ marginTop: 12 }}>
                      <label>Gerekçe</label>
                      <input
                        value={lReason}
                        onChange={(e) => setLReason(e.target.value)}
                        placeholder="Kısa açıklama"
                      />
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <Button type="submit" icon="check" disabled={saving} block>
                        {saving ? 'Kaydediliyor…' : 'İzni kaydet'}
                      </Button>
                    </div>
                  </form>
                </>
              )}

              {tab === 'military' && (
                <>
                  <DataTable<MilitaryRow>
                    rows={military}
                    search
                    csv
                    csvName="ogrenci-dosya-askerlik"
                    empty={
                      <EmptyState
                        icon="file"
                        title="Askerlik kaydı yok"
                        sub="Aşağıdaki formdan yeni kayıt ekleyebilirsiniz."
                      />
                    }
                    columns={[
                      {
                        key: 'status',
                        header: 'Durum',
                        sortable: true,
                        value: (r) => r.status,
                        render: (r) => (
                          <Badge tone={militaryTone(r.status)}>{militaryLabel(r.status)}</Badge>
                        ),
                      },
                      {
                        key: 'deferralDate',
                        header: 'Tecil Tarihi',
                        sortable: true,
                        value: (r) => r.deferralDate ?? '',
                        render: (r) => (r.deferralDate ? fmtDate(r.deferralDate) : dash(null)),
                      },
                      {
                        key: 'note',
                        header: 'Not',
                        value: (r) => r.note ?? '',
                        render: (r) => dash(r.note),
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

                  <h2>Yeni askerlik kaydı</h2>
                  {formErr && <Alert tone="err">{formErr}</Alert>}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitMilitary();
                    }}
                  >
                    <div className="field">
                      <label>Durum</label>
                      <select
                        value={mStatus}
                        onChange={(e) => setMStatus(e.target.value as MilitaryStatus)}
                      >
                        {MILITARY_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label>Tecil tarihi</label>
                      <input
                        type="date"
                        value={mDeferralDate}
                        onChange={(e) => setMDeferralDate(e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Not</label>
                      <input
                        value={mNote}
                        onChange={(e) => setMNote(e.target.value)}
                        placeholder="Kısa açıklama"
                      />
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <Button type="submit" icon="check" disabled={saving} block>
                        {saving ? 'Kaydediliyor…' : 'Kaydı ekle'}
                      </Button>
                    </div>
                  </form>
                </>
              )}

              {tab === 'documents' && (
                <>
                  <DataTable<DocumentRow>
                    rows={documents}
                    search
                    csv
                    csvName="ogrenci-dosya-belgeler"
                    empty={
                      <EmptyState
                        icon="file"
                        title="Belge kaydı yok"
                        sub="Aşağıdaki formdan yeni belge ekleyebilirsiniz."
                      />
                    }
                    columns={[
                      {
                        key: 'kind',
                        header: 'Tür',
                        sortable: true,
                        value: (r) => r.kind,
                        render: (r) => <b>{r.kind}</b>,
                      },
                      {
                        key: 'description',
                        header: 'Açıklama',
                        value: (r) => r.description ?? '',
                        render: (r) => dash(r.description),
                      },
                      {
                        key: 'docNo',
                        header: 'Belge No',
                        sortable: true,
                        value: (r) => r.docNo ?? '',
                        render: (r) => dash(r.docNo),
                      },
                      {
                        key: 'receivedOn',
                        header: 'Geliş Tarihi',
                        sortable: true,
                        value: (r) => r.receivedOn ?? '',
                        render: (r) => (r.receivedOn ? fmtDate(r.receivedOn) : dash(null)),
                      },
                      {
                        key: 'hasOriginal',
                        header: 'Asıl',
                        sortable: true,
                        value: (r) => (r.hasOriginal ? 'Evet' : 'Hayır'),
                        render: (r) =>
                          r.hasOriginal ? (
                            <Badge tone="ok">Asıl var</Badge>
                          ) : (
                            <Badge tone="muted">Yok</Badge>
                          ),
                      },
                    ]}
                  />

                  <h2>Yeni belge</h2>
                  {formErr && <Alert tone="err">{formErr}</Alert>}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitDocument();
                    }}
                  >
                    <div className="field">
                      <label>Belge türü</label>
                      <input
                        value={dKind}
                        onChange={(e) => setDKind(e.target.value)}
                        placeholder="Örn. Diploma, Lise diploması, Sağlık raporu"
                        required
                      />
                    </div>

                    <div className="field">
                      <label>Açıklama</label>
                      <input
                        value={dDescription}
                        onChange={(e) => setDDescription(e.target.value)}
                        placeholder="Kısa açıklama"
                      />
                    </div>

                    <div className="row" style={{ alignItems: 'flex-end' }}>
                      <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                        <label>Belge no</label>
                        <input
                          value={dDocNo}
                          onChange={(e) => setDDocNo(e.target.value)}
                          placeholder="2025/1234"
                        />
                      </div>
                      <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                        <label>Geliş tarihi</label>
                        <input
                          type="date"
                          value={dReceivedOn}
                          onChange={(e) => setDReceivedOn(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="field" style={{ marginTop: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={dHasOriginal}
                          onChange={(e) => setDHasOriginal(e.target.checked)}
                        />
                        Belgenin aslı teslim alındı
                      </label>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <Button type="submit" icon="check" disabled={saving} block>
                        {saving ? 'Kaydediliyor…' : 'Belgeyi kaydet'}
                      </Button>
                    </div>
                  </form>
                </>
              )}

              {tab === 'priorEducations' && (
                <>
                  <DataTable<PriorEducationRow>
                    rows={priorEducations}
                    search
                    csv
                    csvName="ogrenci-dosya-gecmis-egitim"
                    empty={
                      <EmptyState
                        icon="file"
                        title="Geçmiş eğitim kaydı yok"
                        sub="Aşağıdaki formdan yeni kayıt ekleyebilirsiniz."
                      />
                    }
                    columns={[
                      {
                        key: 'schoolName',
                        header: 'Okul',
                        sortable: true,
                        value: (r) => r.schoolName,
                        render: (r) => <b>{r.schoolName}</b>,
                      },
                      {
                        key: 'degree',
                        header: 'Derece',
                        sortable: true,
                        value: (r) => r.degree ?? '',
                        render: (r) => dash(r.degree),
                      },
                      {
                        key: 'graduationYear',
                        header: 'Mezuniyet Yılı',
                        sortable: true,
                        value: (r) => (r.graduationYear != null ? String(r.graduationYear) : ''),
                        render: (r) =>
                          r.graduationYear != null ? String(r.graduationYear) : dash(null),
                      },
                      {
                        key: 'gpa',
                        header: 'Not Ort.',
                        sortable: true,
                        value: (r) => (r.gpa != null ? String(r.gpa) : ''),
                        render: (r) => (r.gpa != null ? r.gpa.toFixed(2) : dash(null)),
                      },
                      {
                        key: 'note',
                        header: 'Not',
                        value: (r) => r.note ?? '',
                        render: (r) => dash(r.note),
                      },
                    ]}
                  />

                  <h2>Yeni geçmiş eğitim</h2>
                  {formErr && <Alert tone="err">{formErr}</Alert>}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitPriorEducation();
                    }}
                  >
                    <div className="field">
                      <label>Okul adı</label>
                      <input
                        value={pSchoolName}
                        onChange={(e) => setPSchoolName(e.target.value)}
                        placeholder="Örn. Ankara Fen Lisesi"
                        required
                      />
                    </div>

                    <div className="field">
                      <label>Derece</label>
                      <input
                        value={pDegree}
                        onChange={(e) => setPDegree(e.target.value)}
                        placeholder="Örn. Lise, Lisans, Yüksek lisans"
                      />
                    </div>

                    <div className="row" style={{ alignItems: 'flex-end' }}>
                      <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                        <label>Mezuniyet yılı</label>
                        <input
                          type="number"
                          value={pGraduationYear}
                          onChange={(e) => setPGraduationYear(e.target.value)}
                          placeholder="2020"
                        />
                      </div>
                      <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                        <label>Not ortalaması</label>
                        <input
                          type="number"
                          step="0.01"
                          value={pGpa}
                          onChange={(e) => setPGpa(e.target.value)}
                          placeholder="3.45"
                        />
                      </div>
                    </div>

                    <div className="field" style={{ marginTop: 12 }}>
                      <label>Not</label>
                      <input
                        value={pNote}
                        onChange={(e) => setPNote(e.target.value)}
                        placeholder="Kısa açıklama"
                      />
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <Button type="submit" icon="check" disabled={saving} block>
                        {saving ? 'Kaydediliyor…' : 'Kaydı ekle'}
                      </Button>
                    </div>
                  </form>
                </>
              )}

              {tab === 'awards' && (
                <>
                  <DataTable<AwardRow>
                    rows={awards}
                    search
                    csv
                    csvName="ogrenci-dosya-oduller"
                    empty={
                      <EmptyState
                        icon="file"
                        title="Ödül kaydı yok"
                        sub="Aşağıdaki formdan yeni ödül ekleyebilirsiniz."
                      />
                    }
                    columns={[
                      {
                        key: 'title',
                        header: 'Başlık',
                        sortable: true,
                        value: (r) => r.title,
                        render: (r) => <b>{r.title}</b>,
                      },
                      {
                        key: 'awardDate',
                        header: 'Tarih',
                        sortable: true,
                        value: (r) => r.awardDate ?? '',
                        render: (r) => (r.awardDate ? fmtDate(r.awardDate) : dash(null)),
                      },
                      {
                        key: 'description',
                        header: 'Açıklama',
                        value: (r) => r.description ?? '',
                        render: (r) => dash(r.description),
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

                  <h2>Yeni ödül</h2>
                  {formErr && <Alert tone="err">{formErr}</Alert>}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitAward();
                    }}
                  >
                    <div className="field">
                      <label>Başlık</label>
                      <input
                        value={aTitle}
                        onChange={(e) => setATitle(e.target.value)}
                        placeholder="Örn. Bölüm birinciliği"
                        required
                      />
                    </div>

                    <div className="field">
                      <label>Ödül tarihi</label>
                      <input
                        type="date"
                        value={aAwardDate}
                        onChange={(e) => setAAwardDate(e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Açıklama</label>
                      <input
                        value={aDescription}
                        onChange={(e) => setADescription(e.target.value)}
                        placeholder="Kısa açıklama"
                      />
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <Button type="submit" icon="check" disabled={saving} block>
                        {saving ? 'Kaydediliyor…' : 'Ödülü kaydet'}
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </>
          )}
        </Card>
      )}
    </>
  );
}
