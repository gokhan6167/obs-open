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
  EmptyState,
  Skeleton,
  SkeletonStats,
  Drawer,
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
interface StudentsResp {
  items: StudentRow[];
  total: number;
}
interface PendingRow {
  enrollmentId: string;
  studentId: string;
  studentNo: string;
  fullName: string;
  courseCode: string;
  courseName: string;
  ects: number;
  submittedAt: string;
  prereqOk: boolean;
  conflictOk: boolean;
  quotaOk: boolean;
}
interface PendingResp {
  items: PendingRow[];
}
interface RecentGrade {
  courseCode: string;
  courseName: string;
  letter: string | null;
  rawScore: number | null;
  status: string;
  termName: string;
}
interface AcademicSummary {
  studentNo: string;
  status: string;
  program: { name: string; code: string };
  gpa: number | null;
  completedEcts: number;
  remainingEcts: number;
  advisorName: string | null;
  classYear: number | null;
  maxDurationLeft: number | null;
  activeCourseCount: number;
  recentGrades: RecentGrade[];
}
interface TimelineItem {
  at: string;
  action: string;
  actorName: string;
  diff: { status?: string; reason?: string; diplomaNo?: string };
}

const STATUS_TR: Record<string, string> = {
  active: 'Aktif',
  aktif: 'Aktif',
  frozen: 'Dondurulmuş',
  kayit_dondurma: 'Kayıt dondurma',
  pasif: 'Pasif',
  graduated: 'Mezun',
  mezun: 'Mezun',
  dismissed: 'İlişik kesildi',
  iliskigi_kesildi: 'İlişik kesildi',
  azami_sure_doldu: 'Azami süre doldu',
  af_ogrencisi: 'Af öğrencisi',
};
function stTr(s: string): string {
  return STATUS_TR[s] ?? s;
}
function stBadge(s: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  return s === 'active' || s === 'aktif'
    ? 'ok'
    : s.includes('kesil') || s === 'dismissed'
      ? 'danger'
      : 'muted';
}

const ACTION_TR: Record<string, string> = {
  create: 'Oluşturuldu',
  update: 'Güncellendi',
  status_change: 'Durum değişikliği',
  'student.status': 'Durum değişikliği',
};

export default function Danismanlik(): React.ReactElement {
  const [students, setStudents] = useState<StudentsResp | null>(null);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<StudentRow | null>(null);
  const [summary, setSummary] = useState<AcademicSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [detailErr, setDetailErr] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [studs, pend] = await Promise.all([
      api<StudentsResp>('/portal/students'),
      api<PendingResp>('/portal/pending-enrollments'),
    ]);
    setStudents(studs);
    setPending(pend.items);
    setSel({});
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'));
  }, [load]);

  const secili = Object.keys(sel).filter((k) => sel[k]);

  function toggle(id: string): void {
    setSel((p) => ({ ...p, [id]: !p[id] }));
  }
  function toggleAll(): void {
    if (secili.length === pending.length) return setSel({});
    const all: Record<string, boolean> = {};
    for (const p of pending) all[p.enrollmentId] = true;
    setSel(all);
  }

  async function topluGecis(to: 'approved' | 'rejected'): Promise<void> {
    if (secili.length === 0) {
      setErr('Önce en az bir kayıt seçin.');
      return;
    }
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      let ok = 0;
      for (const id of secili) {
        await api(`/enrollment/${id}/transition`, {
          method: 'POST',
          body: { to, reason: to === 'rejected' ? 'Danışman reddi' : undefined },
        });
        ok++;
      }
      const m = `${ok} kayıt ${to === 'approved' ? 'onaylandı' : 'reddedildi'}.`;
      setMsg(m);
      toast(to === 'approved' ? 'Kayıtlar onaylandı' : 'Kayıtlar reddedildi', {
        tone: 'ok',
        body: m,
      });
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İşlem başarısız';
      setErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const openDetail = useCallback(async (s: StudentRow) => {
    setDetail(s);
    setSummary(null);
    setTimeline(null);
    setDetailErr('');
    try {
      const [sum, tl] = await Promise.all([
        api<AcademicSummary>(`/students/${s.id}/academic-summary`),
        api<{ items: TimelineItem[] }>(`/students/${s.id}/timeline`),
      ]);
      setSummary(sum);
      setTimeline(tl.items);
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Detay yüklenemedi');
    }
  }, []);

  const temiz = useMemo(
    () => pending.filter((p) => p.prereqOk && p.conflictOk && p.quotaOk).length,
    [pending],
  );

  if (err && !students) {
    return (
      <>
        <PageHeader title="Danışmanlık" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }

  if (!students) {
    return (
      <>
        <PageHeader title="Danışmanlık" />
        <SkeletonStats n={4} />
        <Card>
          <Skeleton lines={6} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Danışmanlık"
        sub="Danışmanı olduğunuz öğrenciler ve bekleyen ders kayıt onayları. Kayıtları seçip toplu onaylayın/reddedin; bir öğrenciye tıklayarak akademik durumunu ve zaman çizelgesini görün."
      />

      {msg && <Alert tone="ok">{msg}</Alert>}
      {err && students && <Alert tone="err">{err}</Alert>}

      <StatGrid
        stats={[
          { label: 'Öğrenci', value: students.total, icon: 'users' },
          {
            label: 'Bekleyen Onay',
            value: pending.length,
            icon: 'inbox',
            tone: pending.length > 0 ? 'warn' : 'ok',
          },
          { label: 'Seçili', value: secili.length, icon: 'check' },
          { label: 'Kontrolü Temiz', value: temiz, icon: 'checkCircle', tone: 'ok' },
        ]}
      />

      <Card
        title="Bekleyen ders kayıt onayları"
        icon="inbox"
        actions={
          pending.length > 0 && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button variant="ghost" sm onClick={toggleAll}>
                {secili.length === pending.length ? 'Seçimi kaldır' : 'Tümünü seç'}
              </Button>
              <Button
                variant="ok"
                sm
                icon="check"
                onClick={() => topluGecis('approved')}
                disabled={busy}
              >
                {busy ? '…' : `Onayla (${secili.length})`}
              </Button>
              <Button
                variant="danger"
                sm
                onClick={() => topluGecis('rejected')}
                disabled={busy}
              >
                {busy ? '…' : `Reddet (${secili.length})`}
              </Button>
            </div>
          )
        }
      >
        {pending.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Bekleyen onay yok"
            sub="Onay bekleyen ders kaydı bulunmuyor."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Öğrenci</th>
                <th>Ders</th>
                <th>AKTS</th>
                <th>Ön Koşul</th>
                <th>Çakışma</th>
                <th>Kontenjan</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => {
                const temizSatir = p.prereqOk && p.conflictOk && p.quotaOk;
                return (
                  <tr
                    key={p.enrollmentId}
                    style={{ background: temizSatir ? undefined : 'var(--warnbg)' }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={!!sel[p.enrollmentId]}
                        onChange={() => toggle(p.enrollmentId)}
                      />
                    </td>
                    <td>
                      {p.fullName} <span className="muted">({p.studentNo})</span>
                    </td>
                    <td>
                      <b>{p.courseCode}</b> · {p.courseName}
                    </td>
                    <td>{p.ects}</td>
                    <td>
                      <Badge tone={p.prereqOk ? 'ok' : 'danger'}>
                        {p.prereqOk ? 'Uygun' : 'Eksik'}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={p.conflictOk ? 'ok' : 'danger'}>
                        {p.conflictOk ? 'Yok' : 'Var'}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={p.quotaOk ? 'ok' : 'warn'}>{p.quotaOk ? 'Var' : 'Dolu'}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Danışmanlık öğrencileri" icon="users">
        {students.items.length === 0 ? (
          <EmptyState
            icon="users"
            title="Kayıtlı öğrenci yok"
            sub="Size atanmış danışmanlık öğrencisi bulunmuyor."
          />
        ) : (
          <DataTable
            rows={students.items}
            csv
            csvName="danismanlik-ogrenciler"
            empty="Aramaya uyan öğrenci yok."
            columns={[
              { key: 'studentNo', header: 'No', value: (s) => s.studentNo, sortable: true },
              { key: 'fullName', header: 'Ad Soyad', value: (s) => s.fullName, sortable: true },
              { key: 'programName', header: 'Program', value: (s) => s.programName, sortable: true },
              {
                key: 'gpa',
                header: 'GNO',
                num: true,
                sortable: true,
                value: (s) => s.gpa ?? -1,
                render: (s) => (s.gpa !== null ? s.gpa.toFixed(2) : '—'),
              },
              {
                key: 'status',
                header: 'Durum',
                value: (s) => stTr(s.status),
                render: (s) => <Badge tone={stBadge(s.status)}>{stTr(s.status)}</Badge>,
              },
              {
                key: 'detail',
                header: '',
                render: (s) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => openDetail(s)}>
                    Detay
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.fullName} · ${detail.studentNo}` : ''}
      >
        {detailErr && <Alert tone="err">{detailErr}</Alert>}
        {detail && !summary && !detailErr && <Skeleton lines={6} />}
        {summary && (
          <>
            <StatGrid
              stats={[
                {
                  label: 'GNO',
                  value: summary.gpa !== null ? summary.gpa.toFixed(2) : '—',
                  icon: 'chart',
                },
                { label: 'Tamamlanan AKTS', value: summary.completedEcts, icon: 'checkCircle' },
                { label: 'Kalan AKTS', value: summary.remainingEcts, icon: 'clock' },
                { label: 'Aktif Ders', value: summary.activeCourseCount, icon: 'book' },
              ]}
            />

            <p className="hint" style={{ margin: '12px 0 4px' }}>
              Program: <b>{summary.program.name}</b> ({summary.program.code})
            </p>
            <p className="hint" style={{ marginBottom: 4 }}>
              Durum: <Badge tone={stBadge(summary.status)}>{stTr(summary.status)}</Badge> · Sınıf:{' '}
              {summary.classYear ?? '—'} · Azami süre kalan: {summary.maxDurationLeft ?? '—'} yıl
            </p>
            {summary.advisorName && <p className="hint">Danışman: {summary.advisorName}</p>}

            <Card title="Son notlar" icon="grade">
              {summary.recentGrades.length === 0 ? (
                <EmptyState icon="grade" title="Not kaydı yok" sub="Henüz not kaydı bulunmuyor." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Ders</th>
                      <th>Harf</th>
                      <th>Dönem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recentGrades.map((g, i) => (
                      <tr key={i}>
                        <td>
                          <b>{g.courseCode}</b> · {g.courseName}
                        </td>
                        <td>{g.letter ? <Badge tone="muted">{g.letter}</Badge> : '—'}</td>
                        <td>{g.termName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Durum zaman çizelgesi" icon="activity">
              {timeline === null ? (
                <Skeleton lines={3} />
              ) : timeline.length === 0 ? (
                <EmptyState icon="clock" title="İşlem yok" sub="Kayıtlı durum işlemi bulunmuyor." />
              ) : (
                <div style={{ borderLeft: '2px solid var(--line)', paddingLeft: 14 }}>
                  {timeline.map((t, i) => (
                    <div key={i} style={{ position: 'relative', paddingBottom: 14 }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: -21,
                          top: 3,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                        }}
                      />
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {ACTION_TR[t.action] ?? t.action}
                        {t.diff.status && (
                          <Badge tone="muted">{stTr(t.diff.status)}</Badge>
                        )}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {new Date(t.at).toLocaleString('tr-TR')} · {t.actorName}
                      </div>
                      {t.diff.reason && (
                        <div style={{ fontSize: 12, marginTop: 2 }}>Gerekçe: {t.diff.reason}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </Drawer>
    </>
  );
}
