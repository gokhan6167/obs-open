'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Alert,
  Skeleton,
  SkeletonStats,
  Segmented,
  Drawer,
  EmptyState,
  BarChart,
  Meter,
  toast,
} from '@/app/ui';

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | null;
}
interface PendingEnrollment {
  enrollmentId: string;
  studentId: string;
  studentNo: string;
  fullName: string | null;
  sectionId: string;
  courseCode: string;
  courseName: string;
  ects: number;
  submittedAt: string;
  prereqOk: boolean;
  conflictOk: boolean;
  quotaOk: boolean;
  advisorApproved: boolean;
  attemptNo: number;
}
interface RequestRow {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  decisionReason: string | null;
  createdAt: string;
  studentNo: string;
}

// GNO bantları -> not/başarı dağılımı önizlemesi (bölüm geneli akademik durum)
const BANDS: { label: string; test: (g: number) => boolean; badge: 'ok' | 'warn' | 'danger' }[] = [
  { label: 'Onur (3.50+)', test: (g) => g >= 3.5, badge: 'ok' },
  { label: 'İyi (3.00–3.49)', test: (g) => g >= 3.0 && g < 3.5, badge: 'ok' },
  { label: 'Orta (2.00–2.99)', test: (g) => g >= 2.0 && g < 3.0, badge: 'warn' },
  { label: 'Riskli (< 2.00)', test: (g) => g < 2.0, badge: 'danger' },
];

const REQ_STATUS_TR: Record<string, string> = {
  submitted: 'Gönderildi',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};
function reqStatusTone(s: string): 'ok' | 'warn' | 'danger' | 'muted' {
  if (s === 'approved') return 'ok';
  if (s === 'rejected' || s === 'cancelled') return 'danger';
  if (s === 'in_review') return 'warn';
  return 'muted';
}
const REQ_TYPE_TR: Record<string, string> = {
  kayit_dondurma: 'Kayıt dondurma',
  mazeret_sinavi: 'Mazeret sınavı',
  belge: 'Belge talebi',
  ders_ekle_sil: 'Ders ekle/sil',
  yatay_gecis: 'Yatay geçiş',
  itiraz: 'Not itirazı',
};

function fmtDate(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR');
}
function fmtDateTime(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function BolumNotOnay(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [pending, setPending] = useState<PendingEnrollment[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const [scope, setScope] = useState<'all' | 'flagged'>('all');
  const [selected, setSelected] = useState<PendingEnrollment | null>(null);

  const [reqType, setReqType] = useState('');
  const [reqStatus, setReqStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [st, pe, rq] = await Promise.all([
          api<{ items: StudentRow[] }>('/portal/students'),
          // Gerçek ön koşul/çakışma/kontenjan kontrolü yapan uç (/portal/pending-enrollments
          // rozetleri sabit döndürür). bolum_baskani kapsamı sunucuda uygulanır.
          api<{ items: PendingEnrollment[] }>('/enrollment/pending'),
          // /portal/requests çıplak dizi döner ({ items } DEĞİL).
          api<RequestRow[]>('/portal/requests').catch(() => []),
        ]);
        setRows(st.items);
        setPending(pe.items);
        setRequests(Array.isArray(rq) ? rq : []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Yükleme hatası');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const gpas = useMemo(
    () => rows.map((r) => r.gpa).filter((g): g is number => g != null),
    [rows],
  );
  const bandCounts = useMemo(
    () => BANDS.map((b) => ({ ...b, count: gpas.filter((g) => b.test(g)).length })),
    [gpas],
  );
  const avgGpa = gpas.length ? gpas.reduce((a, b) => a + b, 0) / gpas.length : null;
  const riskyCount = bandCounts.find((b) => b.label.startsWith('Riskli'))?.count ?? 0;

  const flaggedCount = pending.filter((p) => !p.prereqOk || !p.conflictOk || !p.quotaOk).length;

  const filteredPending = useMemo(
    () =>
      pending.filter((p) => {
        const flagged = !p.prereqOk || !p.conflictOk || !p.quotaOk;
        return scope === 'flagged' ? flagged : true;
      }),
    [pending, scope],
  );

  const reqTypeOptions = useMemo(
    () => [...new Set(requests.map((r) => r.type))].sort(),
    [requests],
  );
  const filteredRequests = useMemo(
    () =>
      requests.filter((r) => {
        if (reqType && r.type !== reqType) return false;
        if (reqStatus && r.status !== reqStatus) return false;
        return true;
      }),
    [requests, reqType, reqStatus],
  );
  const openRequests = requests.filter(
    (r) => r.status === 'submitted' || r.status === 'in_review',
  ).length;

  function toggleScope(v: 'all' | 'flagged'): void {
    setScope(v);
    if (v === 'flagged') {
      toast('İşaretli kayıtlar', {
        tone: flaggedCount > 0 ? 'info' : 'ok',
        body:
          flaggedCount > 0
            ? `${flaggedCount} kayıtta ön koşul / çakışma / kontenjan uyarısı var.`
            : 'Ön kontrol uyarısı olan kayıt yok.',
      });
    }
  }

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Onay Kuyruğu"
        sub="Onaya düşen ders kayıtları, öğrenci dilekçeleri ve bölüm geneli başarı dağılımı — karar öncesi bütünsel görünüm."
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Onay bekleyen kayıt', value: pending.length, icon: 'inbox' },
            {
              label: 'İşaretli (kontrol uyarısı)',
              value: flaggedCount,
              icon: 'flag',
              tone: flaggedCount > 0 ? 'danger' : undefined,
            },
            {
              label: 'Açık dilekçe/başvuru',
              value: openRequests,
              icon: 'fileText',
              tone: openRequests > 0 ? 'warn' : undefined,
            },
            {
              label: 'Riskli öğrenci',
              value: riskyCount,
              icon: 'alert',
              tone: riskyCount > 0 ? 'danger' : undefined,
            },
          ]}
        />
      )}

      <Card
        title="Onay Bekleyen Ders Kayıtları"
        icon="inbox"
        hint="Öğrencilerin onaya gönderdiği (submitted) ders kayıtları. Satırdaki Detay ile ön koşul / çakışma / kontenjan ön kontrol dökümünü ve durum zaman çizelgesini görün. Kesin onay/ret danışman ve ÖİDB iş akışıyla yürütülür."
        actions={
          <Segmented
            value={scope}
            onChange={toggleScope}
            options={[
              { value: 'all', label: 'Tümü' },
              { value: 'flagged', label: 'Sadece işaretliler' },
            ]}
          />
        }
      >
        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable<PendingEnrollment>
            rows={filteredPending}
            search
            csv
            csvName="bolum-onay-bekleyen"
            empty={
              <EmptyState
                icon="checkCircle"
                title={
                  pending.length === 0
                    ? 'Şu an onay bekleyen ders kaydı yok'
                    : 'Filtreye uyan kayıt yok'
                }
                sub={
                  pending.length === 0
                    ? 'Onaya gönderilen ders kayıtları burada listelenir.'
                    : 'İşaretli filtresini kaldırmayı deneyin.'
                }
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                sortable: true,
                value: (p) => p.studentNo,
                render: (p) => <b>{p.studentNo}</b>,
              },
              {
                key: 'fullName',
                header: 'Ad / E-posta',
                sortable: true,
                value: (p) => p.fullName ?? '',
                render: (p) => p.fullName ?? <span className="muted">—</span>,
              },
              {
                key: 'course',
                header: 'Ders',
                sortable: true,
                value: (p) => `${p.courseCode} ${p.courseName}`,
                render: (p) => (
                  <>
                    <b>{p.courseCode}</b> · {p.courseName}
                  </>
                ),
              },
              { key: 'ects', header: 'AKTS', sortable: true, num: true, value: (p) => p.ects },
              {
                key: 'attemptNo',
                header: 'Deneme',
                sortable: true,
                num: true,
                value: (p) => p.attemptNo,
                render: (p) =>
                  p.attemptNo > 1 ? (
                    <Badge tone="warn">{p.attemptNo}. kez</Badge>
                  ) : (
                    <span className="muted">1.</span>
                  ),
              },
              {
                key: 'submittedAt',
                header: 'Gönderim',
                sortable: true,
                value: (p) => p.submittedAt,
                render: (p) => fmtDate(p.submittedAt),
              },
              {
                key: 'check',
                header: 'Ön Kontrol',
                sortable: true,
                value: (p) => (p.prereqOk && p.conflictOk && p.quotaOk ? 1 : 0),
                render: (p) => {
                  const ok = p.prereqOk && p.conflictOk && p.quotaOk;
                  return <Badge tone={ok ? 'ok' : 'danger'}>{ok ? 'Temiz' : 'İncele'}</Badge>;
                },
              },
              {
                key: 'action',
                header: '',
                render: (p) => (
                  <button className="btn ghost sm" onClick={() => setSelected(p)}>
                    Detay
                  </button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card
        title="Öğrenci Dilekçe / Başvuru Kuyruğu"
        icon="fileText"
        hint="Bölüm öğrencilerinin dilekçe ve başvuruları (kayıt dondurma, mazeret, belge, itiraz…). Karar akışı ilgili birime aittir; bölüm başkanı için izleme/inceleme görünümü."
      >
        <div className="row" style={{ marginBottom: 8, gap: 16, flexWrap: 'wrap' }}>
          <div className="field">
            <label>Tür</label>
            <select value={reqType} onChange={(e) => setReqType(e.target.value)}>
              <option value="">Tümü</option>
              {reqTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {REQ_TYPE_TR[t] ?? t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Durum</label>
            <select value={reqStatus} onChange={(e) => setReqStatus(e.target.value)}>
              <option value="">Tümü</option>
              {Object.entries(REQ_STATUS_TR).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <Skeleton lines={5} />
        ) : (
          <DataTable<RequestRow>
            rows={filteredRequests}
            search
            csv
            csvName="bolum-dilekceler"
            empty={
              <EmptyState
                icon="fileText"
                title={
                  requests.length === 0
                    ? 'Görüntülenecek dilekçe/başvuru yok'
                    : 'Filtreye uyan başvuru yok'
                }
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => <b>{r.studentNo}</b>,
              },
              {
                key: 'type',
                header: 'Tür',
                sortable: true,
                value: (r) => REQ_TYPE_TR[r.type] ?? r.type,
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => REQ_STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={reqStatusTone(r.status)}>
                    {REQ_STATUS_TR[r.status] ?? r.status}
                  </Badge>
                ),
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                sortable: true,
                value: (r) => r.createdAt,
                render: (r) => fmtDate(r.createdAt),
              },
              {
                key: 'decisionReason',
                header: 'Karar Notu',
                value: (r) => r.decisionReason ?? '',
                render: (r) => r.decisionReason ?? <span className="muted">—</span>,
              },
            ]}
          />
        )}
      </Card>

      <Card
        title="Sınıf Başarı Dağılımı"
        icon="chart"
        hint="Bölüm geneli GNO bantları — onay kararları öncesi başarı dağılımı özeti."
      >
        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <>
            <StatGrid
              stats={[
                { label: 'Öğrenci', value: rows.length, icon: 'users' },
                {
                  label: 'Ortalama GNO',
                  value: avgGpa != null ? avgGpa.toFixed(2) : '—',
                  icon: 'grade',
                },
                { label: "GNO'lu kayıt", value: gpas.length, icon: 'file' },
                {
                  label: 'Riskli',
                  value: riskyCount,
                  icon: 'alert',
                  tone: riskyCount > 0 ? 'danger' : undefined,
                },
              ]}
            />
            {gpas.length === 0 ? (
              <div style={{ marginTop: 12 }}>
                <EmptyState icon="grade" title="GNO verisi yok" />
              </div>
            ) : (
              <>
                <div style={{ marginTop: 12 }}>
                  <BarChart data={bandCounts.map((b) => ({ label: b.label, value: b.count }))} />
                </div>
                <div style={{ marginTop: 12 }}>
                  {bandCounts.map((b) => {
                    const pct = gpas.length ? Math.round((b.count / gpas.length) * 100) : 0;
                    return (
                      <div key={b.label} style={{ marginBottom: 10 }}>
                        <div
                          className="row"
                          style={{ justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <Badge tone={b.badge}>{b.label}</Badge>
                          <span className="muted" style={{ fontSize: 13 }}>
                            <b>{b.count}</b> öğrenci
                          </span>
                        </div>
                        <Meter value={pct} />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Ders Kaydı · ${selected.studentNo}` : undefined}
      >
        {selected && (
          <>
            <p className="hint">
              <b>{selected.courseCode}</b> · {selected.courseName} · {selected.ects} AKTS
              {selected.fullName ? ` · ${selected.fullName}` : ''}
            </p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <Badge tone={selected.prereqOk ? 'ok' : 'danger'}>
                Ön koşul: {selected.prereqOk ? 'uygun' : 'eksik'}
              </Badge>
              <Badge tone={selected.conflictOk ? 'ok' : 'danger'}>
                Çakışma: {selected.conflictOk ? 'yok' : 'var'}
              </Badge>
              <Badge tone={selected.quotaOk ? 'ok' : 'danger'}>
                Kontenjan: {selected.quotaOk ? 'uygun' : 'dolu'}
              </Badge>
              {selected.attemptNo > 1 && <Badge tone="warn">{selected.attemptNo}. kez</Badge>}
            </div>

            <h2 style={{ marginTop: 16 }}>Durum Zaman Çizelgesi</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li className="list-item">
                <Badge tone="ok">Sepete eklendi</Badge>
              </li>
              <li className="list-item">
                <Badge tone="ok">Onaya gönderildi</Badge>
                <span className="meta"> · {fmtDateTime(selected.submittedAt)}</span>
              </li>
              <li className="list-item">
                {selected.advisorApproved ? (
                  <Badge tone="ok">Danışman onayladı</Badge>
                ) : (
                  <Badge tone="warn">Danışman onayı bekliyor</Badge>
                )}
              </li>
              <li className="list-item">
                <Badge tone="muted">ÖİDB kesin kayıt bekliyor</Badge>
              </li>
            </ul>
          </>
        )}
      </Drawer>
    </>
  );
}
