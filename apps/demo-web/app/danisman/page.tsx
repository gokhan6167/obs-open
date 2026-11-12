'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  EmptyState,
  Skeleton,
  SkeletonStats,
  Alert,
  Segmented,
  Drawer,
  Icon,
  fmtDate,
} from '@/app/ui';
import { api } from '@/lib/api';

interface Student {
  id: string;
  studentNo: string;
  fullName: string;
  programId: string;
  programName: string;
  status: string;
  gpa: number | null;
}
interface StudentList {
  items: Student[];
  total: number;
  page: number;
}
interface RecentGrade {
  courseCode: string;
  courseName: string;
  letter: string | null;
  rawScore: number | null;
  status: string;
  termName: string;
  year: number;
}
interface AcademicSummary {
  id: string;
  studentNo: string;
  status: string;
  program: { id: string; name: string; code: string };
  gpa: number | null;
  completedEcts: number;
  remainingEcts: number;
  advisorName: string | null;
  enrolledAt: string;
  classYear: number;
  maxDurationLeft: number;
  activeCourseCount: number;
  recentGrades: RecentGrade[];
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
function statusLabel(s: string): string {
  return STATUS_TR[s] ?? s;
}

type RiskTier = 'danger' | 'warn' | 'inactive' | 'ok';
/** GNO / durum tabanlı risk sınıflandırması (öğrencilik durumu + GNO eşiği). */
function riskTier(s: Student): RiskTier {
  if (s.status !== 'aktif') return 'inactive';
  if (s.gpa !== null && s.gpa < 1.8) return 'danger';
  if (s.gpa !== null && s.gpa < 2.0) return 'warn';
  return 'ok';
}
function riskBadge(s: Student): { tone: 'ok' | 'warn' | 'danger' | 'muted'; text: string } {
  const t = riskTier(s);
  if (t === 'danger') return { tone: 'danger', text: 'Riskli (GNO<1.80)' };
  if (t === 'warn') return { tone: 'warn', text: 'İzlemede (GNO<2.00)' };
  if (t === 'inactive') return { tone: 'muted', text: statusLabel(s.status) };
  return { tone: 'ok', text: 'Normal' };
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
/** Audit action anahtarını Türkçe okunur ifadeye çevir. */
function actionLabel(a: string): string {
  const map: Record<string, string> = {
    'student.status_change': 'Durum değişikliği',
    'student.create': 'Kayıt oluşturuldu',
    'graduation.approve': 'Mezuniyet onaylandı',
  };
  return map[a] ?? a.replace(/[._]/g, ' ');
}

type TierFilter = 'all' | 'risk' | 'ok' | 'inactive';

export default function DanisanlarimPage(): React.ReactElement {
  const [list, setList] = useState<Student[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const [tier, setTier] = useState<TierFilter>('all');

  const [selected, setSelected] = useState<Student | null>(null);
  const [summary, setSummary] = useState<AcademicSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [drawerErr, setDrawerErr] = useState('');
  const [drawerNote, setDrawerNote] = useState('');
  const [drawerLoading, setDrawerLoading] = useState(false);

  useEffect(() => {
    api<StudentList>('/portal/students')
      .then((r) => setList(r.items))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  function openDrawer(s: Student): void {
    setSelected(s);
    setSummary(null);
    setTimeline([]);
    setDrawerErr('');
    setDrawerNote('');
    setDrawerLoading(true);
    Promise.all([
      api<AcademicSummary>(`/students/${s.id}/academic-summary`).catch((e) => {
        // Danışman erişim kapsamı (kendi öğrencisi değil) -> bilgilendir, çökme.
        setDrawerErr(
          e instanceof Error && /yetki|erişemez|kendi/i.test(e.message)
            ? 'Bu öğrenci akademik erişim kapsamınızda değil (yalnızca ders verdiğiniz öğrenciler açılır).'
            : e instanceof Error
              ? e.message
              : 'Akademik özet alınamadı',
        );
        return null;
      }),
      api<Timeline>(`/students/${s.id}/timeline`)
        .then((t) => t.items)
        .catch(() => [] as TimelineItem[]),
    ])
      .then(([sum, tl]) => {
        setSummary(sum);
        setTimeline(tl);
      })
      .finally(() => setDrawerLoading(false));
  }

  const filtered = useMemo(() => {
    return list.filter((s) => {
      const t = riskTier(s);
      if (tier === 'risk' && !(t === 'danger' || t === 'warn')) return false;
      if (tier === 'ok' && t !== 'ok') return false;
      if (tier === 'inactive' && t !== 'inactive') return false;
      return true;
    });
  }, [list, tier]);

  const stats = useMemo(() => {
    const withGpa = list.filter((s) => s.gpa !== null);
    const avgGpa =
      withGpa.length === 0 ? null : withGpa.reduce((a, s) => a + (s.gpa ?? 0), 0) / withGpa.length;
    return {
      total: list.length,
      risk: list.filter((s) => {
        const t = riskTier(s);
        return t === 'danger' || t === 'warn';
      }).length,
      critical: list.filter((s) => riskTier(s) === 'danger').length,
      active: list.filter((s) => s.status === 'aktif').length,
      avgGpa,
    };
  }, [list]);

  const drawerGpa = summary?.gpa ?? selected?.gpa ?? null;

  return (
    <>
      <PageHeader
        title="Danışan Öğrencilerim"
        sub="Danışmanlık kapsamınızdaki öğrenciler. Satıra tıklayarak akademik özet ve durum zaman çizelgesini açın; risk rozeti GNO ve öğrencilik durumundan üretilir. Ayrıntılı akademik veri yalnızca ders verdiğiniz öğrenciler için açılır."
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={5} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Danışan öğrenci', value: stats.total, icon: 'users' },
            {
              label: 'Kritik (GNO<1.80)',
              value: stats.critical,
              icon: 'alert',
              tone: stats.critical > 0 ? 'danger' : undefined,
            },
            {
              label: 'Risk / izleme',
              value: stats.risk,
              icon: 'flag',
              tone: stats.risk > 0 ? 'warn' : undefined,
            },
            {
              label: 'Ortalama GNO',
              value: stats.avgGpa === null ? '—' : stats.avgGpa.toFixed(2),
              icon: 'chart',
            },
            { label: 'Aktif', value: stats.active, icon: 'checkCircle' },
          ]}
        />
      )}

      <Card
        title="Öğrenci Listesi"
        icon="users"
        hint="Risk rozeti GNO ve öğrencilik durumundan üretilir. Kritik (GNO<1.80) öğrencilerle önce görüşmeniz önerilir."
        actions={
          <Segmented
            value={tier}
            onChange={setTier}
            options={[
              { value: 'all', label: `Tümü (${stats.total})` },
              { value: 'risk', label: `Risk (${stats.risk})` },
              { value: 'ok', label: 'Normal' },
              { value: 'inactive', label: 'Pasif' },
            ]}
          />
        }
      >
        {loading ? (
          <Skeleton lines={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="users"
            title={list.length === 0 ? 'Danışan öğrenci bulunamadı' : 'Filtreye uyan öğrenci yok'}
            sub={
              list.length === 0
                ? 'Danışmanlık kapsamınızda öğrenci görünmüyor.'
                : 'Arama veya filtreyi gevşetin.'
            }
          />
        ) : (
          <DataTable
            rows={filtered}
            csv
            csvName="danisan-ogrenciler"
            search
            pageSize={25}
            columns={[
              {
                key: 'studentNo',
                header: 'No',
                sortable: true,
                value: (s) => s.studentNo,
                render: (s) => <b>{s.studentNo}</b>,
              },
              { key: 'fullName', header: 'Ad', sortable: true, value: (s) => s.fullName },
              { key: 'programName', header: 'Program', value: (s) => s.programName },
              {
                key: 'gpa',
                header: 'GNO',
                num: true,
                sortable: true,
                value: (s) => (s.gpa === null ? -1 : s.gpa),
                render: (s) => (
                  <b
                    style={{
                      color:
                        s.gpa !== null && s.gpa < 1.8
                          ? 'var(--danger)'
                          : s.gpa !== null && s.gpa < 2.0
                            ? 'var(--warn)'
                            : undefined,
                    }}
                  >
                    {s.gpa === null ? '—' : s.gpa.toFixed(2)}
                  </b>
                ),
              },
              {
                key: 'status',
                header: 'Durum',
                value: (s) => statusLabel(s.status),
                render: (s) => <Badge tone="muted">{statusLabel(s.status)}</Badge>,
              },
              {
                key: 'risk',
                header: 'Risk',
                value: (s) => riskBadge(s).text,
                render: (s) => {
                  const r = riskBadge(s);
                  return <Badge tone={r.tone}>{r.text}</Badge>;
                },
              },
              {
                key: 'aksiyon',
                header: '',
                render: (s) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => openDrawer(s)}>
                    Aç
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          selected ? (
            <span>
              {selected.studentNo} · {selected.fullName}
            </span>
          ) : null
        }
      >
        {selected && (
          <>
            <StatGrid
              stats={[
                {
                  label: 'GNO',
                  value: drawerGpa === null ? '—' : drawerGpa.toFixed(2),
                  icon: 'chart',
                  tone:
                    drawerGpa !== null && drawerGpa < 1.8
                      ? 'danger'
                      : drawerGpa !== null && drawerGpa < 2.0
                        ? 'warn'
                        : undefined,
                },
                {
                  label: 'Tamamlanan AKTS',
                  value: summary ? summary.completedEcts : '—',
                  icon: 'award',
                },
                {
                  label: 'Kalan zorunlu AKTS',
                  value: summary ? summary.remainingEcts : '—',
                  icon: 'layers',
                },
                {
                  label: 'Azami süre kalan',
                  value: summary ? `${summary.maxDurationLeft} yıl` : '—',
                  icon: 'clock',
                  tone: summary && summary.maxDurationLeft < 1 ? 'danger' : undefined,
                },
              ]}
            />

            {drawerErr && <Alert tone="err">{drawerErr}</Alert>}

            <Card title="Kimlik / Program" icon="user">
              <div className="list">
                <div className="list-item">
                  Program
                  <div className="meta">
                    {summary
                      ? `${summary.program.name} (${summary.program.code})`
                      : selected.programName}
                  </div>
                </div>
                <div className="list-item">
                  Öğrencilik durumu
                  <div className="meta">{statusLabel(summary?.status ?? selected.status)}</div>
                </div>
                {summary && (
                  <>
                    <div className="list-item">
                      Sınıf / Kayıt yılı
                      <div className="meta">
                        {summary.classYear}. sınıf · {fmtDate(summary.enrolledAt)}
                      </div>
                    </div>
                    <div className="list-item">
                      Aktif dönem ders sayısı
                      <div className="meta">{summary.activeCourseCount} ders</div>
                    </div>
                    {summary.advisorName && (
                      <div className="list-item">
                        Kayıtlı danışman (muadili)
                        <div className="meta">{summary.advisorName}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>

            {drawerLoading ? (
              <Card title="Son Notlar" icon="grade">
                <Skeleton lines={4} />
              </Card>
            ) : (
              summary && (
                <Card title="Son Notlar" icon="grade">
                  {summary.recentGrades.length === 0 ? (
                    <EmptyState icon="grade" title="Girilmiş not yok" />
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Ders</th>
                          <th>Dönem</th>
                          <th>Not</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.recentGrades.slice(0, 8).map((g, i) => (
                          <tr key={`${g.courseCode}-${i}`}>
                            <td>
                              <b>{g.courseCode}</b>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {g.courseName}
                              </div>
                            </td>
                            <td>
                              {g.termName} {g.year}
                            </td>
                            <td>
                              {g.letter ? (
                                <Badge
                                  tone={
                                    ['FF', 'FD', 'F', 'YZ'].includes(g.letter) ? 'danger' : 'ok'
                                  }
                                >
                                  {g.letter}
                                </Badge>
                              ) : (
                                <Badge tone="muted">{g.status === 'draft' ? 'devam' : '—'}</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              )
            )}

            <Card title="Durum Zaman Çizelgesi" icon="activity">
              {timeline.length === 0 ? (
                <EmptyState icon="clock" title="Kayıtlı durum işlemi yok" />
              ) : (
                <div
                  style={{ borderLeft: '2px solid var(--line)', marginLeft: 6, paddingLeft: 14 }}
                >
                  {timeline.slice(0, 12).map((t, i) => (
                    <div key={i} style={{ position: 'relative', paddingBottom: 14 }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: -21,
                          top: 4,
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                        }}
                      />
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{actionLabel(t.action)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {fmtDateTime(t.at)} · {t.actorName}
                      </div>
                      {(t.diff.status || t.diff.reason) && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {t.diff.status && (
                            <Badge tone="muted">{statusLabel(t.diff.status)}</Badge>
                          )}{' '}
                          {t.diff.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="Görüşme Notu (yerel)"
              icon="edit"
              hint="Danışmanlık notu; bu demoda yalnızca oturum içinde tutulur (kalıcı not ucu bu rolde yok)."
            >
              <div className="field" style={{ marginBottom: 0 }}>
                <textarea
                  value={drawerNote}
                  onChange={(e) => setDrawerNote(e.target.value)}
                  placeholder="Örn. GNO düşüşü görüşüldü; tekrar dersleri planlandı."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '9px 11px',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    fontFamily: 'inherit',
                    fontSize: 14,
                    resize: 'vertical',
                  }}
                />
              </div>
            </Card>

            <div className="row" style={{ gap: 8 }}>
              <a className="btn ok" href={`/danisman/ogrenci?id=${selected.id}`}>
                <Icon name="user" size={15} /> Öğrenci 360
              </a>
              <a className="btn ghost" href="/danisman/mezuniyet-kontrol">
                <Icon name="award" size={15} /> Mezuniyet kontrolü
              </a>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
