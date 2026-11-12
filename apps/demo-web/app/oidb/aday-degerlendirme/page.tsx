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
  Drawer,
  Icon,
  toast,
  fmtDate,
} from '@/app/ui';

type ApplicantStatus =
  | 'basvurdu'
  | 'degerlendiriliyor'
  | 'kazandi'
  | 'kazanamadi'
  | 'kesin_kayit';
type DocKind = 'transkript' | 'diploma' | 'dil_belgesi' | 'kimlik';

interface AppProgram {
  id: string;
  programName: string;
  year: number;
  term: string;
  quota: number;
  applicantCount: number;
}
interface Applicant {
  id: string;
  fullName: string;
  nationalId: string;
  score: number | null;
  preferenceNo?: number | null;
  status: ApplicantStatus;
}
interface AppDocument {
  id: string;
  kind: string;
  fileName: string | null;
  verified: boolean;
  createdAt: string;
}
interface RankResult {
  updated: number;
  placed: number;
  quota: number;
}
interface PinResult {
  id: string;
  fullName: string;
  pinCode: string;
}

const STATUS: Record<
  ApplicantStatus,
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }
> = {
  basvurdu: { label: 'Başvurdu', tone: 'muted' },
  degerlendiriliyor: { label: 'Değerlendiriliyor', tone: 'warn' },
  kazandi: { label: 'Kazandı', tone: 'ok' },
  kazanamadi: { label: 'Kazanamadı', tone: 'danger' },
  kesin_kayit: { label: 'Kesin kayıt', tone: 'info' },
};

const DOC_KINDS: { value: DocKind; label: string }[] = [
  { value: 'transkript', label: 'Transkript' },
  { value: 'diploma', label: 'Diploma' },
  { value: 'dil_belgesi', label: 'Dil Belgesi' },
  { value: 'kimlik', label: 'Kimlik' },
];

const DOC_LABEL: Record<string, string> = {
  transkript: 'Transkript',
  diploma: 'Diploma',
  dil_belgesi: 'Dil Belgesi',
  kimlik: 'Kimlik',
};

const metaStyle: React.CSSProperties = { color: 'var(--muted)', fontSize: 12.5, marginTop: 3 };

export default function AdayDegerlendirme(): React.ReactElement {
  const [programs, setPrograms] = useState<AppProgram[]>([]);
  const [progErr, setProgErr] = useState('');
  const [progLoading, setProgLoading] = useState(true);
  const [programId, setProgramId] = useState('');

  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [appErr, setAppErr] = useState('');
  const [appLoading, setAppLoading] = useState(false);

  const [ranking, setRanking] = useState(false);
  const [pinBusy, setPinBusy] = useState('');
  const [pin, setPin] = useState<PinResult | null>(null);

  // Belge paneli
  const [docFor, setDocFor] = useState<Applicant | null>(null);
  const [docs, setDocs] = useState<AppDocument[]>([]);
  const [docErr, setDocErr] = useState('');
  const [docLoading, setDocLoading] = useState(false);
  const [docKind, setDocKind] = useState<DocKind>('transkript');
  const [fileName, setFileName] = useState('');
  const [docSaving, setDocSaving] = useState(false);
  const [docBusy, setDocBusy] = useState('');

  const loadPrograms = useCallback(async () => {
    setProgLoading(true);
    setProgErr('');
    try {
      const d = await api<{ items: AppProgram[] }>('/admissions/programs');
      setPrograms(d.items);
      setProgramId((cur) => cur || (d.items[0]?.id ?? ''));
    } catch (e) {
      setProgErr(e instanceof Error ? e.message : 'Başvuru programları yüklenemedi');
    } finally {
      setProgLoading(false);
    }
  }, []);

  const loadApplicants = useCallback(async (id: string) => {
    if (!id) return;
    setAppLoading(true);
    setAppErr('');
    try {
      const d = await api<{ items: Applicant[] }>(
        `/admissions/applicants?applicationProgramId=${encodeURIComponent(id)}`,
      );
      setApplicants(d.items);
    } catch (e) {
      setAppErr(e instanceof Error ? e.message : 'Adaylar yüklenemedi');
    } finally {
      setAppLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  useEffect(() => {
    void loadApplicants(programId);
  }, [programId, loadApplicants]);

  const program = useMemo(
    () => programs.find((p) => p.id === programId) ?? null,
    [programs, programId],
  );

  const programOptions = useMemo(
    () => programs.map((p) => ({ value: p.id, label: `${p.programName} · ${p.year} ${p.term}` })),
    [programs],
  );

  const stats = useMemo(() => {
    const kazanan = applicants.filter((a) => a.status === 'kazandi' || a.status === 'kesin_kayit');
    const kazanamadi = applicants.filter((a) => a.status === 'kazanamadi');
    return [
      { label: 'Toplam aday', value: String(applicants.length), icon: 'users' },
      { label: 'Kazanan', value: String(kazanan.length), icon: 'award', tone: 'ok' as const },
      {
        label: 'Kazanamadı',
        value: String(kazanamadi.length),
        icon: 'x',
        tone: 'danger' as const,
      },
    ];
  }, [applicants]);

  async function runRank(): Promise<void> {
    if (!program) return;
    const ok = window.confirm(
      `${program.programName} programı için otomatik sıralama yapılacak.\n\n` +
        `Adaylar puana göre sıralanıp kontenjan (${program.quota}) kadarı "kazandı", ` +
        'kalanı "kazanamadı" olarak işaretlenecek ve sonuç ilan edilecek. Onaylıyor musunuz?',
    );
    if (!ok) return;
    setRanking(true);
    try {
      const r = await api<RankResult>(`/admissions-deep/programs/${program.id}/rank`, {
        method: 'POST',
      });
      toast('Sıralama tamamlandı ve ilan edildi', {
        tone: 'ok',
        body: `${r.updated} aday güncellendi · ${r.placed} yerleşti (kontenjan ${r.quota}).`,
      });
      await loadApplicants(program.id);
      await loadPrograms();
    } catch (e) {
      toast('Sıralama yapılamadı', {
        tone: 'err',
        body: e instanceof Error ? e.message : 'Bilinmeyen hata',
      });
    } finally {
      setRanking(false);
    }
  }

  async function issuePin(a: Applicant): Promise<void> {
    setPinBusy(a.id);
    try {
      const r = await api<PinResult>(`/admissions-deep/applicants/${a.id}/pin`, { method: 'POST' });
      setPin(r);
      toast('PIN üretildi', { tone: 'ok', body: `${a.fullName} için yeni takip PIN'i oluşturuldu.` });
    } catch (e) {
      toast('PIN üretilemedi', {
        tone: 'err',
        body: e instanceof Error ? e.message : 'Bilinmeyen hata',
      });
    } finally {
      setPinBusy('');
    }
  }

  async function copyPin(): Promise<void> {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin.pinCode);
      toast('PIN kopyalandı', { tone: 'ok' });
    } catch {
      toast('Kopyalanamadı', { tone: 'err', body: 'PIN’i elle seçip kopyalayabilirsiniz.' });
    }
  }

  const loadDocs = useCallback(async (applicantId: string) => {
    setDocLoading(true);
    setDocErr('');
    try {
      const d = await api<{ items: AppDocument[] }>(
        `/admissions-deep/applicants/${applicantId}/documents`,
      );
      setDocs(d.items);
    } catch (e) {
      setDocErr(e instanceof Error ? e.message : 'Belgeler yüklenemedi');
    } finally {
      setDocLoading(false);
    }
  }, []);

  function openDocs(a: Applicant): void {
    setDocFor(a);
    setDocs([]);
    setDocKind('transkript');
    setFileName('');
    void loadDocs(a.id);
  }

  async function addDoc(): Promise<void> {
    if (!docFor) return;
    if (!fileName.trim()) {
      toast('Dosya adı gerekli', { tone: 'err', body: 'Belge için bir dosya adı girin.' });
      return;
    }
    setDocSaving(true);
    try {
      await api(`/admissions-deep/applicants/${docFor.id}/documents`, {
        method: 'POST',
        body: { kind: docKind, fileName: fileName.trim() },
      });
      toast('Belge eklendi', { tone: 'ok', body: `${DOC_LABEL[docKind]} · ${fileName.trim()}` });
      setFileName('');
      await loadDocs(docFor.id);
    } catch (e) {
      toast('Belge eklenemedi', {
        tone: 'err',
        body: e instanceof Error ? e.message : 'Bilinmeyen hata',
      });
    } finally {
      setDocSaving(false);
    }
  }

  async function verifyDoc(d: AppDocument): Promise<void> {
    if (!docFor) return;
    setDocBusy(d.id);
    try {
      await api(`/admissions-deep/documents/${d.id}`, {
        method: 'PATCH',
        body: { verified: true },
      });
      toast('Belge doğrulandı', { tone: 'ok', body: DOC_LABEL[d.kind] ?? d.kind });
      await loadDocs(docFor.id);
    } catch (e) {
      toast('Doğrulanamadı', {
        tone: 'err',
        body: e instanceof Error ? e.message : 'Bilinmeyen hata',
      });
    } finally {
      setDocBusy('');
    }
  }

  return (
    <>
      <PageHeader
        title="Aday Değerlendirme ve Sıralama"
        sub="Başvuru programı adaylarını değerlendirin, puana göre sıralayıp sonucu ilan edin."
        actions={
          <Button
            icon="award"
            onClick={() => void runRank()}
            disabled={!program || ranking || applicants.length === 0}
          >
            {ranking ? 'Sıralanıyor…' : 'Otomatik Sırala ve İlan Et'}
          </Button>
        }
      />

      <Card title="Başvuru programı" icon="grade">
        {progLoading ? (
          <Skeleton lines={2} />
        ) : progErr ? (
          <Alert tone="err">{progErr}</Alert>
        ) : programs.length === 0 ? (
          <EmptyState
            icon="grade"
            title="Başvuru programı yok"
            sub="Değerlendirme yapabilmek için önce bir başvuru programı tanımlanmalıdır."
          />
        ) : (
          <>
            <Segmented value={programId} onChange={setProgramId} options={programOptions} />
            {program && (
              <div className="info-box" style={{ marginTop: 14 }}>
                <b>{program.programName}</b> · {program.year} {program.term} — Kontenjan{' '}
                <b>{program.quota}</b>, başvuran <b>{program.applicantCount}</b>
                {program.applicantCount > program.quota && (
                  <>
                    {' '}
                    · kontenjan üstü <b>{program.applicantCount - program.quota}</b> başvuru
                  </>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {programId && !appLoading && !appErr && applicants.length > 0 && <StatGrid stats={stats} />}

      <Card title="Adaylar" icon="users" hint="Puan ve tercih sırasına göre değerlendirme listesi.">
        {!programId ? (
          <EmptyState
            icon="grade"
            title="Program seçin"
            sub="Adayları listelemek için bir başvuru programı seçin."
          />
        ) : appLoading ? (
          <Skeleton lines={6} />
        ) : appErr ? (
          <Alert tone="err">{appErr}</Alert>
        ) : applicants.length === 0 ? (
          <EmptyState
            icon="users"
            title="Aday bulunamadı"
            sub="Bu başvuru programına henüz aday kaydı yapılmamış."
          />
        ) : (
          <DataTable<Applicant>
            rows={applicants}
            csv
            csvName="aday-degerlendirme"
            empty="Kayıt bulunamadı."
            columns={[
              {
                key: 'fullName',
                header: 'Ad Soyad',
                value: (r) => r.fullName,
                render: (r) => <b>{r.fullName}</b>,
              },
              {
                key: 'nationalId',
                header: 'T.C. Kimlik No',
                value: (r) => r.nationalId,
                render: (r) => r.nationalId,
              },
              {
                key: 'score',
                header: 'Puan',
                num: true,
                value: (r) => r.score ?? -1,
                render: (r) =>
                  r.score != null ? r.score.toFixed(3) : <span className="muted">—</span>,
              },
              {
                key: 'preferenceNo',
                header: 'Tercih',
                num: true,
                value: (r) => r.preferenceNo ?? 0,
                render: (r) =>
                  r.preferenceNo != null ? (
                    `${r.preferenceNo}. tercih`
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                key: 'status',
                header: 'Durum',
                value: (r) => STATUS[r.status]?.label ?? r.status,
                render: (r) => (
                  <Badge tone={STATUS[r.status]?.tone ?? 'muted'}>
                    {STATUS[r.status]?.label ?? r.status}
                  </Badge>
                ),
              },
              {
                key: 'action',
                header: 'İşlem',
                sortable: false,
                render: (r) => (
                  <div className="row" style={{ gap: 6 }}>
                    <Button
                      variant="subtle"
                      sm
                      icon="shield"
                      disabled={pinBusy === r.id}
                      onClick={() => void issuePin(r)}
                    >
                      {pinBusy === r.id ? 'Üretiliyor…' : 'PIN üret'}
                    </Button>
                    <Button variant="subtle" sm icon="fileText" onClick={() => openDocs(r)}>
                      Belgeler
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* PIN sonucu */}
      <Drawer open={pin != null} onClose={() => setPin(null)} title="Aday Takip PIN’i">
        {pin && (
          <>
            <div className="info-box">
              <b>{pin.fullName}</b> adlı aday, aşağıdaki PIN ve T.C. kimlik numarası ile başvuru
              durumunu sorgulayabilir. PIN yalnızca bir kez gösterilir; adaya güvenli kanaldan
              iletin.
            </div>
            <div
              style={{
                margin: '18px 0',
                padding: '20px 18px',
                textAlign: 'center',
                borderRadius: 12,
                border: '1px solid var(--line)',
                background: 'var(--card-2)',
                fontSize: 30,
                fontWeight: 750,
                letterSpacing: 6,
                color: 'var(--accent)',
              }}
            >
              {pin.pinCode}
            </div>
            <Button block icon="link" onClick={() => void copyPin()}>
              PIN’i Kopyala
            </Button>
          </>
        )}
      </Drawer>

      {/* Belgeler */}
      <Drawer
        open={docFor != null}
        onClose={() => setDocFor(null)}
        title={docFor ? `${docFor.fullName} · Belgeler` : 'Belgeler'}
      >
        {docFor && (
          <>
            {docErr ? (
              <Alert tone="err">{docErr}</Alert>
            ) : docLoading ? (
              <Skeleton lines={4} />
            ) : docs.length === 0 ? (
              <EmptyState
                icon="fileText"
                title="Belge yok"
                sub="Bu aday için henüz başvuru belgesi yüklenmemiş."
              />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {docs.map((d) => (
                  <div
                    key={d.id}
                    className="row"
                    style={{
                      justifyContent: 'space-between',
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      background: 'var(--card-2)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <Icon name="fileText" size={16} style={{ color: 'var(--muted)' }} />
                        <b>{DOC_LABEL[d.kind] ?? d.kind}</b>
                        <Badge tone={d.verified ? 'ok' : 'warn'}>
                          {d.verified ? 'doğrulandı' : 'beklemede'}
                        </Badge>
                      </div>
                      <div style={metaStyle}>
                        {d.fileName ?? 'dosya adı yok'} · {fmtDate(d.createdAt)}
                      </div>
                    </div>
                    {!d.verified && (
                      <Button
                        variant="ok"
                        sm
                        icon="check"
                        disabled={docBusy === d.id}
                        onClick={() => void verifyDoc(d)}
                      >
                        {docBusy === d.id ? 'İşleniyor…' : 'Doğrula'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
              <div className="field">
                <label>Belge Türü</label>
                <select
                  value={docKind}
                  onChange={(e) => setDocKind(e.target.value as DocKind)}
                  aria-label="Belge Türü"
                >
                  {DOC_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Dosya Adı</label>
                <input
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  maxLength={400}
                  placeholder="örn. transkript-2026.pdf"
                />
              </div>
              <Button block icon="upload" disabled={docSaving} onClick={() => void addDoc()}>
                {docSaving ? 'Ekleniyor…' : 'Belge Ekle'}
              </Button>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
