'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
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
  Meter,
  fmtDate,
} from '@/app/ui';

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programId: string;
  programName: string;
  status: string;
  gpa: number | string | null;
}
interface RecentGrade {
  courseCode: string;
  courseName: string;
  letter: string | null;
  status: string;
  termName?: string;
  year?: number;
}
interface AcademicSummary {
  id: string;
  studentNo: string;
  status: string;
  program: { id: string; name: string; code: string };
  gpa: number | string | null;
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
  diff: { status?: { from?: string; to?: string } | string; reason?: string } | Record<string, unknown>;
}

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  kayit_dondurma: 'Kayıt Dondurma',
  pasif: 'Pasif',
  iliskigi_kesildi: 'İlişiği Kesildi',
  mezun: 'Mezun',
  azami_sure_doldu: 'Azami Süre Doldu',
  af_ogrencisi: 'Af Öğrencisi',
};
const STATUS_BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  aktif: 'ok',
  mezun: 'muted',
  kayit_dondurma: 'warn',
  pasif: 'muted',
  iliskigi_kesildi: 'danger',
  azami_sure_doldu: 'danger',
  af_ogrencisi: 'warn',
};

const gpaText = (v: number | string | null | undefined): string => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n == null || Number.isNaN(n) ? '—' : n.toFixed(2);
};
const gpaNum = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n == null || Number.isNaN(n) ? 0 : n;
};
const fmtDateTime = (s: string): string => {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
};

/** Audit aksiyon anahtarını insan-okur Türkçe etikete çevir (durum çizelgesi). */
function actionLabel(action: string): string {
  const map: Record<string, string> = {
    'student.kayit_dondur': 'Kayıt donduruldu',
    'student.kaydi_ac': 'Kayıt yeniden açıldı',
    'student.pasiflestir': 'Pasife alındı',
    'student.yeniden_aktiflestir': 'Yeniden aktifleştirildi',
    'student.mezun_et': 'Mezun edildi',
    'student.azami_sure_isaretle': 'Azami süre doldu olarak işaretlendi',
    'student.iliski_kes': 'İlişiği kesildi',
    'student.af_uygula': 'Af uygulandı',
    'graduation.onaylandi': 'Mezuniyet onaylandı',
  };
  if (map[action]) return map[action];
  return action.replace(/[._]/g, ' ');
}
function statusFromDiff(diff: TimelineItem['diff']): string | null {
  const s = (diff as { status?: unknown }).status;
  if (s && typeof s === 'object') {
    const o = s as { from?: string; to?: string };
    if (o.to) return `${STATUS_TR[o.from ?? ''] ?? o.from ?? '?'} → ${STATUS_TR[o.to] ?? o.to}`;
  }
  if (typeof s === 'string') return STATUS_TR[s] ?? s;
  return null;
}

type StatusKey = 'all' | 'aktif' | 'kayit_dondurma' | 'mezun' | 'iliskigi_kesildi';
const STATUS_FILTERS: { value: StatusKey; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'aktif', label: 'Aktif' },
  { value: 'kayit_dondurma', label: 'Kayıt Dondurma' },
  { value: 'mezun', label: 'Mezun' },
  { value: 'iliskigi_kesildi', label: 'İlişiği Kesildi' },
];

export default function OgrenciArama(): React.ReactElement {
  const [all, setAll] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const [sel, setSel] = useState<StudentRow | null>(null);
  const [summary, setSummary] = useState<AcademicSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [detailErr, setDetailErr] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api<{ items: StudentRow[]; total?: number }>('/portal/students')
      .then((d) => {
        setAll(d.items);
        setTotal(d.total ?? d.items.length);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return all;
    return all.filter((s) => s.status === statusFilter);
  }, [all, statusFilter]);

  const statusCount = (k: string): number =>
    k === 'all' ? all.length : all.filter((s) => s.status === k).length;

  async function openDetail(s: StudentRow): Promise<void> {
    setSel(s);
    setSummary(null);
    setTimeline(null);
    setDetailErr('');
    setDetailLoading(true);
    try {
      const [sum, tl] = await Promise.all([
        api<AcademicSummary>(`/students/${s.id}/academic-summary`),
        api<{ items: TimelineItem[] }>(`/students/${s.id}/timeline`).catch(() => ({
          items: [] as TimelineItem[],
        })),
      ]);
      setSummary(sum);
      setTimeline(tl.items);
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Profil yüklenemedi');
    } finally {
      setDetailLoading(false);
    }
  }

  const ectsPct = summary
    ? (() => {
        const t = summary.completedEcts + summary.remainingEcts;
        return t > 0 ? Math.round((summary.completedEcts / t) * 100) : 0;
      })()
    : 0;

  return (
    <>
      <PageHeader
        title="Öğrenci Arama"
        sub="Ad, öğrenci numarası veya program adıyla arayın; akademik özet, danışman, AKTS ilerlemesi ve işlem zaman çizelgesi için satırdaki Görüntüle düğmesine basın. Bu ekran salt-görüntülemedir; durum değişikliği yetkisi ilgili karar mercii (Öğrenci İşleri / Dekanlık) tarafından işlenir."
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Kayıtlı Öğrenci', value: total, icon: 'users' },
            { label: 'Aktif', value: statusCount('aktif'), icon: 'checkCircle', tone: 'ok' },
            {
              label: 'Kayıt Dondurma',
              value: statusCount('kayit_dondurma'),
              icon: 'clock',
              tone: statusCount('kayit_dondurma') > 0 ? 'warn' : undefined,
            },
            { label: 'Eşleşen Sonuç', value: filtered.length, icon: 'search' },
          ]}
        />
      )}

      <Card
        title="Arama & Filtre"
        icon="search"
        hint="Ad, numara veya program adına göre arayın; sütun başlığına tıklayarak sıralayın. Detay için Görüntüle."
      >
        <Segmented value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTERS} />
        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable
            rows={filtered}
            search
            csv
            csvName="ogrenci-listesi"
            pageSize={25}
            empty={
              <EmptyState
                icon="users"
                title="Eşleşen öğrenci bulunamadı"
                sub="Arama terimini veya durum filtresini değiştirin."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                value: (s) => s.studentNo,
                sortable: true,
                render: (s) => <b>{s.studentNo}</b>,
              },
              { key: 'fullName', header: 'Ad', value: (s) => s.fullName, sortable: true },
              { key: 'programName', header: 'Program', value: (s) => s.programName, sortable: true },
              {
                key: 'gpa',
                header: 'GNO',
                num: true,
                value: (s) => gpaNum(s.gpa),
                sortable: true,
                render: (s) => gpaText(s.gpa),
              },
              {
                key: 'status',
                header: 'Durum',
                value: (s) => STATUS_TR[s.status] ?? s.status,
                sortable: true,
                render: (s) => (
                  <Badge tone={STATUS_BADGE[s.status] ?? 'muted'}>
                    {STATUS_TR[s.status] ?? s.status}
                  </Badge>
                ),
              },
              {
                key: 'act',
                header: '',
                render: (s) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => void openDetail(s)}>
                    Görüntüle
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
        title={sel ? `${sel.fullName} · Öğrenci Profili` : ''}
      >
        {sel && (
          <>
            {detailLoading ? (
              <Skeleton lines={8} />
            ) : detailErr ? (
              <Alert tone="err">{detailErr}</Alert>
            ) : (
              <>
                <StatGrid
                  stats={[
                    { label: 'Öğrenci No', value: sel.studentNo, icon: 'user' },
                    { label: 'GNO', value: gpaText(summary?.gpa ?? sel.gpa), icon: 'grade' },
                    { label: 'Sınıf', value: summary ? `${summary.classYear}.` : '—', icon: 'award' },
                    {
                      label: 'Durum',
                      value: STATUS_TR[(summary ?? sel).status] ?? (summary ?? sel).status,
                      icon: 'shield',
                      tone: STATUS_BADGE[(summary ?? sel).status] === 'danger'
                        ? 'danger'
                        : STATUS_BADGE[(summary ?? sel).status] === 'warn'
                          ? 'warn'
                          : 'ok',
                    },
                  ]}
                />

                {summary && (
                  <>
                    <StatGrid
                      stats={[
                        { label: 'Tamamlanan AKTS', value: summary.completedEcts, icon: 'check' },
                        { label: 'Kalan AKTS', value: summary.remainingEcts, icon: 'layers' },
                        { label: 'Aktif Ders', value: summary.activeCourseCount, icon: 'book' },
                        {
                          label: 'Azami Süre (yıl)',
                          value: summary.maxDurationLeft,
                          icon: 'clock',
                          tone: summary.maxDurationLeft <= 1 ? 'danger' : undefined,
                        },
                      ]}
                    />

                    <div style={{ marginTop: 12 }}>
                      <Meter value={ectsPct} label="AKTS İlerlemesi" />
                    </div>

                    <div className="row" style={{ gap: 24, flexWrap: 'wrap', marginTop: 14 }}>
                      <div>
                        <div className="l muted" style={{ fontSize: 12 }}>Program</div>
                        <div>
                          <b>{summary.program.name}</b> ({summary.program.code})
                        </div>
                      </div>
                      <div>
                        <div className="l muted" style={{ fontSize: 12 }}>Danışman</div>
                        <div>{summary.advisorName ?? 'Atanmamış'}</div>
                      </div>
                      <div>
                        <div className="l muted" style={{ fontSize: 12 }}>Kayıt Tarihi</div>
                        <div>{fmtDate(summary.enrolledAt)}</div>
                      </div>
                    </div>

                    <h3 style={{ marginTop: 18, marginBottom: 4 }}>Son Notlar</h3>
                    {summary.recentGrades.length === 0 ? (
                      <EmptyState icon="grade" title="Not kaydı yok" sub="Açıklanmış not bulunmuyor." />
                    ) : (
                      <table style={{ marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th>Ders</th>
                            <th>Dönem</th>
                            <th>Harf</th>
                            <th>Durum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.recentGrades.slice(0, 8).map((g, i) => (
                            <tr key={`${g.courseCode}-${i}`}>
                              <td>
                                <b>{g.courseCode}</b> · {g.courseName}
                              </td>
                              <td className="muted">
                                {g.termName ?? '—'} {g.year ?? ''}
                              </td>
                              <td>
                                <Badge tone="muted">{g.letter ?? '—'}</Badge>
                              </td>
                              <td className="muted">{g.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}

                <h3 style={{ marginTop: 18, marginBottom: 4 }}>İşlem Zaman Çizelgesi</h3>
                <p className="hint" style={{ marginTop: 0 }}>
                  Öğrenci kaydına ilişkin durum/işlem geçmişi (audit kaynaklı). Hassas alanlar
                  maskelenir.
                </p>
                {timeline == null ? (
                  <Skeleton lines={3} />
                ) : timeline.length === 0 ? (
                  <EmptyState icon="activity" title="İşlem geçmişi yok" sub="Kayıtlı durum değişikliği bulunmuyor." />
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {timeline.map((t, i) => {
                      const st = statusFromDiff(t.diff);
                      const reason = (t.diff as { reason?: string }).reason;
                      return (
                        <li
                          key={i}
                          className="list-item"
                          style={{ borderLeft: '2px solid var(--border,#e5e7eb)', paddingLeft: 12 }}
                        >
                          <b>{actionLabel(t.action)}</b>
                          {st && <span> · {st}</span>}
                          <div className="meta">
                            {fmtDateTime(t.at)} · {t.actorName}
                            {reason ? ` · Gerekçe: ${reason}` : ''}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <Alert tone="info">
                  Bu kart tümüyle canlı endpoint verisinden (academic-summary + timeline)
                  derlenmiştir. Fakülte sekreterliğinin durum değiştirme yetkisi yoktur; ilgili
                  işlemleri karar mercii yürütür.
                </Alert>
              </>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
