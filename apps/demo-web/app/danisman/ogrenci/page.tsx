'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Alert,
  Segmented,
  EmptyState,
  Skeleton,
  SkeletonStats,
  Icon,
  fmtDate,
} from '@/app/ui';
import { api } from '@/lib/api';

interface Student {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | null;
}
interface StudentList {
  items: Student[];
}
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
}
interface AcademicSummary {
  completedEcts: number;
  remainingEcts: number;
  classYear: number;
  maxDurationLeft: number;
  activeCourseCount: number;
}
interface GradeRow {
  courseCode: string;
  courseName: string;
  letter: string | null;
  rawScore: number | null;
  status: string;
  termName: string;
  year: number;
}
interface Transcript {
  items: GradeRow[];
  gpa: number | null;
}
interface Completion {
  missingMandatory: string[];
  missingMandatoryEcts: number;
  meetsGpa: boolean;
  meetsEcts: boolean;
  isComplete: boolean;
}
interface GradStatus {
  completion: Completion;
  gpa: number;
  earnedEcts: number;
  honor: string;
}
interface TimelineItem {
  at: string;
  action: string;
  actorName: string;
  diff: { status?: string; reason?: string; diplomaNo?: string };
}
interface Timeline {
  items: TimelineItem[];
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
const HONOR_TR: Record<string, string> = {
  yuksek_onur: 'Yüksek Onur',
  onur: 'Onur',
  yok: '—',
};
const FAIL_LETTERS = new Set(['FF', 'FD', 'F', 'YZ', 'DZ']);

function statusLabel(s: string): string {
  return STATUS_TR[s] ?? s;
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}
function actionLabel(a: string): string {
  const map: Record<string, string> = {
    'student.status_change': 'Durum değişikliği',
    'student.create': 'Kayıt oluşturuldu',
    'graduation.approve': 'Mezuniyet onaylandı',
  };
  return map[a] ?? a.replace(/[._]/g, ' ');
}
function scopeError(e: unknown): boolean {
  return e instanceof Error && /yetki|erişemez|kendi öğrenci/i.test(e.message);
}

type Tab = 'ozet' | 'transkript' | 'mezuniyet' | 'zaman';

function Ogrenci360Inner(): React.ReactElement {
  const params = useSearchParams();
  const id = params.get('id');

  const [list, setList] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(id);
  const [pickerQ, setPickerQ] = useState('');
  const [listErr, setListErr] = useState('');

  const [overview, setOverview] = useState<Overview | null>(null);
  const [summary, setSummary] = useState<AcademicSummary | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [grad, setGrad] = useState<GradStatus | null>(null);
  const [gradErr, setGradErr] = useState('');
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [scopeBlocked, setScopeBlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('ozet');

  useEffect(() => {
    api<StudentList>('/portal/students')
      .then((r) => setList(r.items))
      .catch((e) => setListErr(e instanceof Error ? e.message : 'Yükleme hatası'));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setOverview(null);
    setSummary(null);
    setTranscript(null);
    setGrad(null);
    setGradErr('');
    setTimeline([]);
    setScopeBlocked(false);
    setTab('ozet');
    Promise.all([
      api<Overview>(`/students/${selectedId}/overview`).catch((e) => {
        if (scopeError(e)) setScopeBlocked(true);
        return null;
      }),
      api<AcademicSummary>(`/students/${selectedId}/academic-summary`).catch(() => null),
      api<Transcript>(`/students/${selectedId}/grades`).catch(() => null),
      api<GradStatus>(`/graduation/students/${selectedId}/status`).catch((e) => {
        setGradErr(e instanceof Error ? e.message : 'Mezuniyet durumu alınamadı');
        return null;
      }),
      api<Timeline>(`/students/${selectedId}/timeline`)
        .then((t) => t.items)
        .catch(() => [] as TimelineItem[]),
    ])
      .then(([ov, sum, tr, g, tl]) => {
        setOverview(ov);
        setSummary(sum);
        setTranscript(tr);
        setGrad(g);
        setTimeline(tl);
      })
      .finally(() => setLoading(false));
  }, [selectedId]);

  const selected = list.find((s) => s.id === selectedId) ?? null;
  const gpa = overview?.gpa ?? selected?.gpa ?? grad?.gpa ?? null;

  const pickerList = useMemo(() => {
    const needle = pickerQ.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((s) =>
      `${s.studentNo} ${s.fullName} ${s.programName}`.toLowerCase().includes(needle),
    );
  }, [list, pickerQ]);

  return (
    <>
      <PageHeader
        title="Öğrenci 360"
        sub="Seçili öğrencinin kimlik, program, akademik durum, transkript, mezuniyet uygunluğu ve durum zaman çizelgesi tek görünümde (danışman erişim kapsamıyla sınırlı)."
      />

      {listErr && <Alert tone="err">{listErr}</Alert>}

      <Card title="Öğrenci Seç" icon="search">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
            <label>Öğrenci ara</label>
            <input
              value={pickerQ}
              onChange={(e) => setPickerQ(e.target.value)}
              placeholder="No / ad / program"
            />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
            <label>Öğrenci seç ({pickerList.length})</label>
            <select value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value || null)}>
              <option value="">— Seçiniz —</option>
              {pickerList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.studentNo} · {s.fullName}
                  {s.gpa !== null ? ` · GNO ${s.gpa.toFixed(2)}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {!selectedId ? (
        <EmptyState
          icon="user"
          title="Öğrenci seçilmedi"
          sub="Ayrıntılı 360 görünümü için yukarıdan bir öğrenci seçin."
        />
      ) : loading ? (
        <>
          <SkeletonStats n={5} />
          <Card>
            <Skeleton lines={6} />
          </Card>
        </>
      ) : scopeBlocked && !overview ? (
        <Alert tone="err">
          Bu öğrenci akademik erişim kapsamınızda değil. Danışman erişimi yalnızca ders verdiğiniz
          öğrencilerin ayrıntılı verisini açar; genel liste bilgisi için Danışan Öğrencilerim
          sayfasını kullanın.
        </Alert>
      ) : (
        <>
          <StatGrid
            stats={[
              {
                label: 'GNO',
                value: gpa === null ? '—' : gpa.toFixed(2),
                icon: 'chart',
                tone: gpa !== null && gpa < 1.8 ? 'danger' : gpa !== null && gpa < 2.0 ? 'warn' : undefined,
              },
              {
                label: 'Kazanılan AKTS',
                value: overview ? overview.earnedEcts : (summary?.completedEcts ?? '—'),
                icon: 'award',
              },
              { label: 'Aktif dönem AKTS', value: overview ? overview.activeEcts : '—', icon: 'layers' },
              {
                label: 'Kalan zorunlu ders',
                value: overview ? overview.remainingMandatory : '—',
                icon: 'book',
                tone: (overview?.remainingMandatory ?? 0) > 0 ? 'warn' : undefined,
              },
              { label: 'Durum', value: statusLabel(overview?.status ?? selected?.status ?? '—'), icon: 'flag' },
            ]}
          />

          <div style={{ margin: '4px 0 14px' }}>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'ozet', label: 'Özet' },
                { value: 'transkript', label: 'Transkript' },
                { value: 'mezuniyet', label: 'Mezuniyet' },
                { value: 'zaman', label: 'Zaman Çizelgesi' },
              ]}
            />
          </div>

          {tab === 'ozet' && (
            <div className="home-grid">
              <Card title="Kimlik / Program" icon="user">
                <div className="list">
                  <div className="list-item">
                    Öğrenci No
                    <div className="meta">{overview?.studentNo ?? selected?.studentNo ?? '—'}</div>
                  </div>
                  <div className="list-item">
                    E-posta
                    <div className="meta">{overview?.email ?? selected?.fullName ?? '—'}</div>
                  </div>
                  <div className="list-item">
                    Program
                    <div className="meta">
                      {overview
                        ? `${overview.program.name} (${overview.program.code})`
                        : (selected?.programName ?? '—')}
                    </div>
                  </div>
                  {overview?.curriculumVersion && (
                    <div className="list-item">
                      Müfredat versiyonu
                      <div className="meta">{overview.curriculumVersion}</div>
                    </div>
                  )}
                  {overview?.advisorName && (
                    <div className="list-item">
                      Kayıtlı danışman (muadili)
                      <div className="meta">{overview.advisorName}</div>
                    </div>
                  )}
                  {overview?.enrolledAt && (
                    <div className="list-item">
                      Kayıt tarihi
                      <div className="meta">
                        {fmtDate(overview.enrolledAt)}
                        {summary ? ` · ${summary.classYear}. sınıf` : ''}
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <Card title="Akademik Yük" icon="layers">
                {summary ? (
                  <div className="list">
                    <div className="list-item">
                      Tamamlanan / Kalan AKTS
                      <div className="meta">
                        {summary.completedEcts} tamamlandı · {summary.remainingEcts} zorunlu kaldı
                      </div>
                    </div>
                    <div className="list-item">
                      Aktif dönem ders sayısı
                      <div className="meta">{summary.activeCourseCount} ders</div>
                    </div>
                    <div className="list-item">
                      Azami süre kalan
                      <div className="meta">
                        <Badge
                          tone={
                            summary.maxDurationLeft < 1
                              ? 'danger'
                              : summary.maxDurationLeft < 2
                                ? 'warn'
                                : 'ok'
                          }
                        >
                          {summary.maxDurationLeft} yıl
                        </Badge>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="muted">Akademik yük verisi kapsam dışı.</p>
                )}
                <div className="info-box" style={{ marginTop: 12 }}>
                  Mali durum ve transkript resmi çıktısı danışman kapsamı dışındadır; öğrenciyi ÖİDB
                  / Mali İşler kanalına yönlendirin.
                </div>
              </Card>
            </div>
          )}

          {tab === 'transkript' && (
            <Card
              title={`Not Dökümü${transcript?.gpa != null ? ` · GNO ${transcript.gpa.toFixed(2)}` : ''}`}
              icon="fileText"
            >
              {!transcript ? (
                <EmptyState icon="fileText" title="Transkript verisi kapsam dışı ya da alınamadı" />
              ) : transcript.items.length === 0 ? (
                <EmptyState icon="grade" title="Girilmiş not bulunmuyor" />
              ) : (
                <DataTable
                  rows={transcript.items}
                  csv
                  csvName={`transkript-${selected?.studentNo ?? selectedId}`}
                  search
                  pageSize={30}
                  columns={[
                    {
                      key: 'course',
                      header: 'Ders',
                      value: (g) => `${g.courseCode} ${g.courseName}`,
                      render: (g) => (
                        <>
                          <b>{g.courseCode}</b>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {g.courseName}
                          </div>
                        </>
                      ),
                    },
                    {
                      key: 'term',
                      header: 'Dönem',
                      value: (g) => `${g.year} ${g.termName}`,
                      render: (g) => `${g.termName} ${g.year}`,
                    },
                    {
                      key: 'raw',
                      header: 'Ham',
                      num: true,
                      value: (g) => g.rawScore ?? -1,
                      render: (g) => g.rawScore ?? '—',
                    },
                    {
                      key: 'letter',
                      header: 'Harf',
                      value: (g) => g.letter ?? '',
                      render: (g) =>
                        g.letter ? (
                          <Badge tone={FAIL_LETTERS.has(g.letter) ? 'danger' : 'ok'}>
                            {g.letter}
                          </Badge>
                        ) : (
                          '—'
                        ),
                    },
                    {
                      key: 'status',
                      header: 'Durum',
                      value: (g) => g.status,
                      render: (g) => (
                        <Badge
                          tone={
                            g.status === 'finalized' || g.status === 'announced'
                              ? 'ok'
                              : g.status === 'draft'
                                ? 'warn'
                                : 'muted'
                          }
                        >
                          {g.status === 'draft'
                            ? 'Devam'
                            : g.status === 'announced'
                              ? 'İlan'
                              : g.status === 'finalized'
                                ? 'Kesin'
                                : g.status}
                        </Badge>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          )}

          {tab === 'mezuniyet' && (
            <Card title="Mezuniyet Uygunluğu" icon="award">
              {gradErr ? (
                <Alert tone="err">{gradErr}</Alert>
              ) : !grad ? (
                <EmptyState icon="award" title="Mezuniyet verisi alınamadı" />
              ) : (
                <>
                  <Alert tone={grad.completion.isComplete ? 'ok' : 'err'}>
                    {grad.completion.isComplete
                      ? 'Tüm mezuniyet koşulları sağlanıyor — ÖİDB onayına hazır.'
                      : 'Mezuniyet koşulları henüz tamamlanmadı.'}
                  </Alert>
                  <StatGrid
                    stats={[
                      {
                        label: 'GNO',
                        value: grad.gpa.toFixed(2),
                        icon: 'chart',
                        tone: grad.completion.meetsGpa ? undefined : 'danger',
                      },
                      {
                        label: 'Kazanılan AKTS',
                        value: grad.earnedEcts,
                        icon: 'award',
                        tone: grad.completion.meetsEcts ? undefined : 'danger',
                      },
                      {
                        label: 'Onur durumu',
                        value: HONOR_TR[grad.honor] ?? grad.honor,
                        icon: 'award',
                      },
                    ]}
                  />
                  <div className="list" style={{ marginTop: 12 }}>
                    <div
                      className="list-item"
                      style={{
                        borderLeft: `4px solid ${grad.completion.meetsGpa ? 'var(--ok)' : 'var(--danger)'}`,
                        paddingLeft: 10,
                      }}
                    >
                      <Badge tone={grad.completion.meetsGpa ? 'ok' : 'danger'}>
                        {grad.completion.meetsGpa ? 'Tamam' : 'Eksik'}
                      </Badge>{' '}
                      GNO koşulu
                      <div className="meta">Güncel GNO {grad.gpa.toFixed(2)}</div>
                    </div>
                    <div
                      className="list-item"
                      style={{
                        borderLeft: `4px solid ${grad.completion.meetsEcts ? 'var(--ok)' : 'var(--danger)'}`,
                        paddingLeft: 10,
                      }}
                    >
                      <Badge tone={grad.completion.meetsEcts ? 'ok' : 'danger'}>
                        {grad.completion.meetsEcts ? 'Tamam' : 'Eksik'}
                      </Badge>{' '}
                      Toplam AKTS koşulu
                      <div className="meta">Kazanılan {grad.earnedEcts} AKTS</div>
                    </div>
                    <div
                      className="list-item"
                      style={{
                        borderLeft: `4px solid ${grad.completion.missingMandatory.length === 0 ? 'var(--ok)' : 'var(--danger)'}`,
                        paddingLeft: 10,
                      }}
                    >
                      <Badge tone={grad.completion.missingMandatory.length === 0 ? 'ok' : 'danger'}>
                        {grad.completion.missingMandatory.length === 0
                          ? 'Tamam'
                          : `${grad.completion.missingMandatory.length} eksik`}
                      </Badge>{' '}
                      Zorunlu dersler
                      <div className="meta">
                        {grad.completion.missingMandatory.length === 0
                          ? 'Tüm zorunlu dersler tamamlandı'
                          : `${grad.completion.missingMandatory.join(', ')} · ${grad.completion.missingMandatoryEcts} AKTS`}
                      </div>
                    </div>
                  </div>
                  <div className="info-box" style={{ marginTop: 12 }}>
                    Kesin mezuniyet onayı yalnızca ÖİDB tarafından verilir. Danışman ön kontrol
                    yapar, öğrenciyi eksikler için yönlendirir.
                  </div>
                </>
              )}
            </Card>
          )}

          {tab === 'zaman' && (
            <Card title="Durum / İşlem Zaman Çizelgesi" icon="activity">
              {timeline.length === 0 ? (
                <EmptyState icon="clock" title="Kayıtlı durum işlemi yok" />
              ) : (
                <div
                  style={{ borderLeft: '2px solid var(--line)', marginLeft: 6, paddingLeft: 16 }}
                >
                  {timeline.map((t, i) => (
                    <div key={i} style={{ position: 'relative', paddingBottom: 16 }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: -23,
                          top: 4,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                        }}
                      />
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{actionLabel(t.action)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {fmtDateTime(t.at)} · {t.actorName}
                      </div>
                      {(t.diff.status || t.diff.reason || t.diff.diplomaNo) && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                          {t.diff.status && <Badge tone="muted">{statusLabel(t.diff.status)}</Badge>}{' '}
                          {t.diff.diplomaNo && <Badge tone="ok">Diploma {t.diff.diplomaNo}</Badge>}{' '}
                          {t.diff.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}

export default function Ogrenci360Page(): React.ReactElement {
  return (
    <Suspense fallback={<Skeleton lines={4} />}>
      <Ogrenci360Inner />
    </Suspense>
  );
}
