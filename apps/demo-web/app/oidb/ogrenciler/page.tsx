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
  Segmented,
  toast,
  money,
  fmtDate,
} from '@/app/ui';

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string; // API'de e-posta; kimlik olarak gösterilir
  programId: string;
  programName: string;
  status: string;
  gpa: number | null;
}
interface StudentDetail {
  id: string;
  studentNo: string;
  status: string;
  programId: string;
}
// GET /students/{id}/overview
interface Overview {
  id: string;
  studentNo: string;
  fullName: string;
  email: string;
  status: string;
  program: { id: string; name: string; code: string };
  curriculumVersion: string | null;
  advisorName: string | null;
  enrolledAt: string;
  gpa: number | null;
  earnedEcts: number;
  activeEcts: number;
  remainingMandatory: number;
  outstandingDebt: number;
}
// GET /students/{id}/grades
interface GradeItem {
  courseCode: string;
  courseName: string;
  letter: string | null;
  rawScore: number | null;
  status: string;
  termName: string;
  year: number;
}
interface GradesResp {
  items: GradeItem[];
  gpa: number | null;
}
// GET /students/{id}/timeline
interface TimelineItem {
  at: string;
  action: string;
  actorName: string;
  diff: {
    status?: { from?: string; to?: string } | string;
    reason?: string;
    diplomaNo?: string;
  };
}
interface TimelineResp {
  items: TimelineItem[];
}
// GET /finance/students/{id}/debt
interface Debt {
  studentId: string;
  outstanding: number;
}

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  kayit_dondurma: 'Kayıt Donduruldu',
  pasif: 'Pasif',
  iliskigi_kesildi: 'İlişiği Kesildi',
  mezun: 'Mezun',
  azami_sure_doldu: 'Azami Süre Doldu',
  af_ogrencisi: 'Af Öğrencisi',
};
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  aktif: 'ok',
  mezun: 'ok',
  kayit_dondurma: 'warn',
  af_ogrencisi: 'warn',
  azami_sure_doldu: 'warn',
  pasif: 'muted',
  iliskigi_kesildi: 'danger',
};
const GRADE_STATUS_TR: Record<string, string> = {
  draft: 'Taslak',
  announced: 'İlan Edildi',
  finalized: 'Kesinleşti',
};
const GRADE_STATUS_TONE: Record<string, 'ok' | 'warn' | 'muted'> = {
  draft: 'muted',
  announced: 'warn',
  finalized: 'ok',
};
const FAIL_LETTERS = new Set(['FF', 'NA', 'DZ']);
// Geri-alınamaz sayılan (uyarı gösterilecek) hedef durumlar.
const IRREVERSIBLE = new Set(['iliskigi_kesildi', 'mezun', 'azami_sure_doldu']);
const TARGETS: { value: string; label: string }[] = [
  { value: 'aktif', label: 'Aktif' },
  { value: 'kayit_dondurma', label: 'Kayıt Dondurma' },
  { value: 'pasif', label: 'Pasif' },
  { value: 'af_ogrencisi', label: 'Af Öğrencisi' },
  { value: 'azami_sure_doldu', label: 'Azami Süre Doldu' },
  { value: 'iliskigi_kesildi', label: 'İlişik Kesme' },
];

type Tab = 'ozet' | 'notlar' | 'zaman' | 'durum';

function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'muted' {
  return STATUS_TONE[s] ?? 'muted';
}
// api() 404'te "Hata 404" mesajı fırlatır; o bölümü gizlemek için ayırt et.
function isNotFound(e: unknown): boolean {
  return e instanceof Error && /\b404\b/.test(e.message);
}
// Denetim aksiyonundan okunaklı etiket (student.<action>).
function actionLabel(action: string): string {
  const key = action.replace(/^student\./, '');
  return key.replace(/_/g, ' ');
}
function diffText(diff: TimelineItem['diff']): string | null {
  const parts: string[] = [];
  if (diff.status) {
    if (typeof diff.status === 'string') parts.push(STATUS_TR[diff.status] ?? diff.status);
    else if (diff.status.to)
      parts.push(
        `${diff.status.from ? (STATUS_TR[diff.status.from] ?? diff.status.from) + ' → ' : ''}${STATUS_TR[diff.status.to] ?? diff.status.to}`,
      );
  }
  if (diff.diplomaNo) parts.push(`Diploma no: ${diff.diplomaNo}`);
  if (diff.reason) parts.push(`Gerekçe: ${diff.reason}`);
  return parts.length ? parts.join(' · ') : null;
}

export default function Ogrenciler(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [sel, setSel] = useState<StudentRow | null>(null);
  const [tab, setTab] = useState<Tab>('ozet');

  // 360 bölümleri (her biri 404'te gizlenir).
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ovHidden, setOvHidden] = useState(false);
  const [ovErr, setOvErr] = useState('');
  const [grades, setGrades] = useState<GradesResp | null>(null);
  const [grHidden, setGrHidden] = useState(false);
  const [grErr, setGrErr] = useState('');
  const [timeline, setTimeline] = useState<TimelineResp | null>(null);
  const [tlHidden, setTlHidden] = useState(false);
  const [tlErr, setTlErr] = useState('');
  const [debt, setDebt] = useState<Debt | null>(null);
  const [debtHidden, setDebtHidden] = useState(false);

  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [to, setTo] = useState('kayit_dondurma');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [listErr, setListErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api<{ items: StudentRow[] }>('/portal/students');
    setRows(res.items);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setListErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(
    () => rows.filter((r) => !statusFilter || r.status === statusFilter),
    [rows, statusFilter],
  );

  // Durum dağılımı (özet kartları için).
  const dist = useMemo(() => {
    const d = { aktif: 0, kayit_dondurma: 0, mezun: 0, other: 0 };
    for (const r of rows) {
      if (r.status === 'aktif') d.aktif++;
      else if (r.status === 'kayit_dondurma') d.kayit_dondurma++;
      else if (r.status === 'mezun') d.mezun++;
      else d.other++;
    }
    return d;
  }, [rows]);

  async function open(r: StudentRow): Promise<void> {
    setSel(r);
    setTab('ozet');
    setErr('');
    setReason('');
    // 360 bölümleri sıfırla.
    setOverview(null);
    setOvHidden(false);
    setOvErr('');
    setGrades(null);
    setGrHidden(false);
    setGrErr('');
    setTimeline(null);
    setTlHidden(false);
    setTlErr('');
    setDebt(null);
    setDebtHidden(false);
    setDetail(null);

    // Durum değişikliği için güncel durum (durum makinesi).
    api<StudentDetail>(`/students/${r.id}`)
      .then(setDetail)
      .catch(() => {
        /* durum kartı yoksa satır durumu kullanılır */
      });

    // GET /students/{id}/overview
    api<Overview>(`/students/${r.id}/overview`)
      .then(setOverview)
      .catch((e) => (isNotFound(e) ? setOvHidden(true) : setOvErr(e instanceof Error ? e.message : 'Özet alınamadı')));

    // GET /students/{id}/grades
    api<GradesResp>(`/students/${r.id}/grades`)
      .then(setGrades)
      .catch((e) => (isNotFound(e) ? setGrHidden(true) : setGrErr(e instanceof Error ? e.message : 'Notlar alınamadı')));

    // GET /students/{id}/timeline
    api<TimelineResp>(`/students/${r.id}/timeline`)
      .then(setTimeline)
      .catch((e) => (isNotFound(e) ? setTlHidden(true) : setTlErr(e instanceof Error ? e.message : 'Zaman çizelgesi alınamadı')));

    // GET /finance/students/{id}/debt
    api<Debt>(`/finance/students/${r.id}/debt`)
      .then(setDebt)
      .catch((e) => (isNotFound(e) ? setDebtHidden(true) : setDebt(null)));
  }

  async function changeStatus(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!sel) return;
    if (IRREVERSIBLE.has(to)) {
      const ok = window.confirm(
        `"${STATUS_TR[to]}" durumu GERİ ALINAMAZ. ${sel.studentNo} için onaylıyor musunuz?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setErr('');
    try {
      await api(`/students/${sel.id}/status`, {
        method: 'POST',
        body: { to, reason: reason || undefined },
      });
      toast('Durum güncellendi', {
        tone: 'ok',
        body: `${sel.studentNo} → ${STATUS_TR[to] ?? to}`,
      });
      setReason('');
      await load();
      setDetail(await api<StudentDetail>(`/students/${sel.id}`));
      // seçili satırın yerel kopyasını da güncelle (rozet anında yansısın)
      setSel((s) => (s ? { ...s, status: to } : s));
      // durum değişince zaman çizelgesini tazele.
      api<TimelineResp>(`/students/${sel.id}/timeline`)
        .then(setTimeline)
        .catch(() => undefined);
    } catch (e2) {
      const m = e2 instanceof Error ? e2.message : 'Durum değiştirilemedi';
      setErr(m);
      toast('Durum değiştirilemedi', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const curStatus = detail?.status ?? overview?.status ?? sel?.status ?? '';
  const outstanding = debt?.outstanding ?? overview?.outstandingDebt ?? null;

  // Sekme listesi (gizlenen bölümler seçilebilir sekme olarak da elenir).
  const tabs: { value: Tab; label: string }[] = [
    ...(!ovHidden ? [{ value: 'ozet' as Tab, label: 'Özet' }] : []),
    ...(!grHidden ? [{ value: 'notlar' as Tab, label: 'Notlar' }] : []),
    ...(!tlHidden ? [{ value: 'zaman' as Tab, label: 'Zaman Çizelgesi' }] : []),
    { value: 'durum' as Tab, label: 'Durum' },
  ];

  return (
    <>
      <PageHeader
        title="Öğrenci Arama & 360"
        sub="Öğrenciyi bul, satırına tıkla; Öğrenci 360 çekmecesinde özet, notlar, zaman çizelgesi ve borç bilgisini sekmeli gör; gerekçeli durum değişikliği yap. Son 50 kayıt listelenir."
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Aktif', value: dist.aktif, icon: 'checkCircle', tone: 'ok' },
            { label: 'Kayıt donduran', value: dist.kayit_dondurma, icon: 'clock', tone: dist.kayit_dondurma > 0 ? 'warn' : undefined },
            { label: 'Mezun', value: dist.mezun, icon: 'award' },
            { label: 'Diğer durum', value: dist.other, icon: 'users' },
          ]}
        />
      )}

      <Card title="Öğrenci Listesi" icon="users">
        {listErr && <Alert tone="err">{listErr}</Alert>}
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Durum filtresi</label>
          <Segmented
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: 'Tümü' },
              ...Object.entries(STATUS_TR).map(([v, l]) => ({ value: v, label: l })),
            ]}
          />
        </div>
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<StudentRow>
            rows={filtered}
            search
            csv
            csvName="oidb-ogrenciler"
            empty={
              <EmptyState
                icon="users"
                title="Eşleşen öğrenci yok"
                sub="Arama terimini veya durum filtresini gevşetin."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'No',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => <b>{r.studentNo}</b>,
              },
              { key: 'fullName', header: 'E-posta', sortable: true, value: (r) => r.fullName },
              { key: 'programName', header: 'Program', sortable: true, value: (r) => r.programName },
              {
                key: 'gpa',
                header: 'GNO',
                sortable: true,
                num: true,
                value: (r) => (r.gpa != null ? r.gpa : -1),
                render: (r) => (r.gpa != null ? r.gpa.toFixed(2) : '—'),
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={statusTone(r.status)}>{STATUS_TR[r.status] ?? r.status}</Badge>
                ),
              },
              {
                key: 'action',
                header: '',
                render: (r) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => open(r)}>
                    360
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel ? `Öğrenci 360 · ${sel.studentNo}` : undefined}
      >
        {sel && (
          <>
            <p className="hint">
              {overview?.fullName ?? sel.fullName} · {overview?.program.name ?? sel.programName}
              {overview?.program.code ? ` (${overview.program.code})` : ''}
            </p>

            {/* Borç uyarısı (üstte, her sekmede görünür). */}
            {outstanding != null && outstanding > 0 && (
              <Alert tone="warn">
                Açık borç: <b>{money(outstanding)}</b>. Öğrencinin mali işlemleri askıya
                alınmış olabilir.
              </Alert>
            )}

            <Segmented value={tab} onChange={(v) => setTab(v as Tab)} options={tabs} />

            {/* ---------------- ÖZET ---------------- */}
            {tab === 'ozet' && !ovHidden && (
              <div style={{ marginTop: 12 }}>
                {ovErr ? (
                  <Alert tone="err">{ovErr}</Alert>
                ) : !overview ? (
                  <SkeletonStats n={4} />
                ) : (
                  <>
                    <StatGrid
                      stats={[
                        {
                          label: 'GNO',
                          value: overview.gpa != null ? overview.gpa.toFixed(2) : '—',
                          icon: 'grade',
                          tone: overview.gpa != null && overview.gpa < 2.0 ? 'danger' : undefined,
                        },
                        {
                          label: 'Kazanılan AKTS',
                          value: overview.earnedEcts,
                          icon: 'award',
                        },
                        {
                          label: 'Açık borç',
                          value: outstanding != null ? money(outstanding) : '—',
                          icon: 'wallet',
                          tone: outstanding != null && outstanding > 0 ? 'danger' : undefined,
                        },
                        {
                          label: 'Güncel durum',
                          value: (
                            <Badge tone={statusTone(curStatus)}>
                              {STATUS_TR[curStatus] ?? curStatus}
                            </Badge>
                          ),
                          icon: 'user',
                        },
                      ]}
                    />
                    <table style={{ marginTop: 12 }}>
                      <tbody>
                        <tr>
                          <td className="muted">Aktif dönem AKTS</td>
                          <td className="num">{overview.activeEcts}</td>
                        </tr>
                        <tr>
                          <td className="muted">Kalan zorunlu ders</td>
                          <td className="num">{overview.remainingMandatory}</td>
                        </tr>
                        <tr>
                          <td className="muted">Müfredat</td>
                          <td className="num">{overview.curriculumVersion ?? '—'}</td>
                        </tr>
                        <tr>
                          <td className="muted">Danışman</td>
                          <td className="num">{overview.advisorName ?? '—'}</td>
                        </tr>
                        <tr>
                          <td className="muted">Kayıt tarihi</td>
                          <td className="num">{fmtDate(overview.enrolledAt)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}

            {/* ---------------- NOTLAR ---------------- */}
            {tab === 'notlar' && !grHidden && (
              <div style={{ marginTop: 12 }}>
                {grErr ? (
                  <Alert tone="err">{grErr}</Alert>
                ) : !grades ? (
                  <Skeleton lines={6} />
                ) : grades.items.length === 0 ? (
                  <EmptyState icon="grade" title="Not kaydı yok" />
                ) : (
                  <>
                    <p className="hint">
                      GNO: <b>{grades.gpa != null ? grades.gpa.toFixed(2) : '—'}</b> ·{' '}
                      {grades.items.length} kayıt
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>Ders</th>
                          <th>Dönem</th>
                          <th className="num">Puan</th>
                          <th>Harf</th>
                          <th>Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grades.items.map((g, i) => (
                          <tr key={`${g.courseCode}-${g.year}-${i}`}>
                            <td>
                              <b>{g.courseCode}</b>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {g.courseName}
                              </div>
                            </td>
                            <td className="muted">
                              {g.termName} {g.year}
                            </td>
                            <td className="num">{g.rawScore != null ? g.rawScore : '—'}</td>
                            <td>
                              {g.letter ? (
                                <Badge tone={FAIL_LETTERS.has(g.letter) ? 'danger' : 'ok'}>
                                  {g.letter}
                                </Badge>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              <Badge tone={GRADE_STATUS_TONE[g.status] ?? 'muted'}>
                                {GRADE_STATUS_TR[g.status] ?? g.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}

            {/* ---------------- ZAMAN ÇİZELGESİ ---------------- */}
            {tab === 'zaman' && !tlHidden && (
              <div style={{ marginTop: 12 }}>
                {tlErr ? (
                  <Alert tone="err">{tlErr}</Alert>
                ) : !timeline ? (
                  <Skeleton lines={5} />
                ) : timeline.items.length === 0 ? (
                  <EmptyState icon="activity" title="İşlem kaydı yok" />
                ) : (
                  <div className="timeline">
                    {timeline.items.map((t, i) => {
                      const d = diffText(t.diff);
                      return (
                        <div
                          key={`${t.at}-${i}`}
                          style={{
                            display: 'flex',
                            gap: 10,
                            padding: '10px 0',
                            borderBottom: '1px solid var(--line)',
                          }}
                        >
                          <span style={{ color: 'var(--muted)', minWidth: 90, fontSize: 12 }}>
                            {fmtDate(t.at)}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                              {actionLabel(t.action)}
                            </div>
                            {d && (
                              <div className="muted" style={{ fontSize: 13 }}>
                                {d}
                              </div>
                            )}
                            <div className="muted" style={{ fontSize: 12 }}>
                              {t.actorName}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ---------------- DURUM DEĞİŞİKLİĞİ ---------------- */}
            {tab === 'durum' && (
              <div style={{ marginTop: 12 }}>
                {err && <Alert tone="err">{err}</Alert>}
                {IRREVERSIBLE.has(to) && (
                  <Alert tone="warn">
                    Dikkat: <b>{STATUS_TR[to]}</b> geri alınamaz bir işlemdir. Onaydan sonra durum
                    makinesi geçişi kalıcıdır ve denetim kaydına yazılır.
                  </Alert>
                )}
                <form onSubmit={changeStatus}>
                  <div className="field">
                    <label>Yeni durum</label>
                    <select value={to} onChange={(e) => setTo(e.target.value)}>
                      {TARGETS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Gerekçe</label>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Karar gerekçesi (denetim kaydına yazılır)"
                    />
                  </div>
                  <Button
                    variant={IRREVERSIBLE.has(to) ? 'danger' : 'primary'}
                    type="submit"
                    disabled={busy}
                    block
                  >
                    {busy ? 'İşleniyor…' : 'Uygula'}
                  </Button>
                </form>
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Not: Geçersiz geçişler (durum makinesi) sunucuda reddedilir; hata mesajı burada
                  gösterilir.
                </p>
              </div>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
