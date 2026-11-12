'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Button,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonStats,
  toast,
} from '@/app/ui';
import { api } from '@/lib/api';

interface Pending {
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
interface PendingList {
  items: Pending[];
}

type Action = 'approved' | 'rejected' | 'draft';
const ACTION_TR: Record<Action, string> = {
  approved: 'onaylandı',
  rejected: 'reddedildi',
  draft: 'revizyona gönderildi',
};

function flagBadge(ok: boolean, okText: string, badText: string): React.ReactElement {
  return <Badge tone={ok ? 'ok' : 'danger'}>{ok ? okText : badText}</Badge>;
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

interface StudentGroup {
  studentId: string;
  studentNo: string;
  fullName: string | null;
  rows: Pending[];
  totalEcts: number;
}

export default function KayitOnayPage(): React.ReactElement {
  const [items, setItems] = useState<Pending[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    setLoading(true);
    api<PendingList>('/enrollment/pending')
      .then((r) => {
        setItems(r.items);
        setChecked({});
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo<StudentGroup[]>(() => {
    const needle = q.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (!needle) return true;
      return `${i.studentNo} ${i.fullName ?? ''} ${i.courseCode} ${i.courseName}`
        .toLowerCase()
        .includes(needle);
    });
    const byStudent = new Map<string, StudentGroup>();
    for (const i of filtered) {
      const g = byStudent.get(i.studentId) ?? {
        studentId: i.studentId,
        studentNo: i.studentNo,
        fullName: i.fullName,
        rows: [],
        totalEcts: 0,
      };
      g.rows.push(i);
      g.totalEcts += i.ects;
      byStudent.set(i.studentId, g);
    }
    return [...byStudent.values()].sort((a, b) => a.studentNo.localeCompare(b.studentNo, 'tr'));
  }, [items, q]);

  const selectedIds = Object.keys(checked).filter((k) => checked[k]);
  const visibleIds = groups.flatMap((g) => g.rows.map((r) => r.enrollmentId));

  async function transition(ids: string[], to: Action): Promise<void> {
    if (ids.length === 0) return;
    if ((to === 'rejected' || to === 'draft') && reason.trim().length === 0) {
      const t =
        to === 'rejected'
          ? 'Reddetmek için gerekçe girin.'
          : 'Revizyona göndermek için açıklama girin (öğrenci düzeltip yeniden gönderir).';
      setErr(t);
      toast('Gerekçe gerekli', { tone: 'err', body: t });
      return;
    }
    setBusy(true);
    setErr('');
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await api(`/enrollment/${id}/transition`, {
          method: 'POST',
          body: to === 'approved' ? { to } : { to, reason: reason.trim() },
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBusy(false);
    if (fail === 0) {
      toast('İşlem tamamlandı', { tone: 'ok', body: `${ok} kayıt ${ACTION_TR[to]}.` });
    } else {
      const m = `${ok} işlendi, ${fail} başarısız (uygun olmayan durum geçişi olabilir).`;
      setErr(m);
      toast('Kısmen başarısız', { tone: 'err', body: m });
    }
    setReason('');
    load();
  }

  const stats = useMemo(() => {
    const students = new Set(items.map((i) => i.studentId));
    const flagged = items.filter((i) => !i.prereqOk || !i.conflictOk || !i.quotaOk).length;
    return {
      total: items.length,
      students: students.size,
      flagged,
      ects: items.reduce((s, i) => s + i.ects, 0),
    };
  }, [items]);

  return (
    <>
      <PageHeader
        title="Ders Kayıt Onay Kuyruğu"
        sub="Öğrencilerin gönderdiği (submitted) ders kayıtlarını öğrenci bazında inceleyin; onaylayın, gerekçeyle reddedin veya revizyon için geri gönderin. Satır bayrakları önkoşul, çakışma ve kontenjan ön kontrolünü gösterir."
        actions={
          <Button variant="ghost" icon="refresh" onClick={load} disabled={busy || loading}>
            Yenile
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Bekleyen kayıt', value: stats.total, icon: 'inbox' },
            { label: 'Öğrenci', value: stats.students, icon: 'users' },
            {
              label: 'Bayraklı satır',
              value: stats.flagged,
              icon: 'flag',
              tone: stats.flagged > 0 ? 'warn' : undefined,
            },
            { label: 'Seçili', value: selectedIds.length, icon: 'check' },
          ]}
        />
      )}

      <Card
        title="Toplu İşlem"
        icon="layers"
        hint="Onay için gerekçe zorunlu değildir; reddederken veya revizyona gönderirken gerekçe girin. Toplu işlem yalnızca seçili satırlara uygulanır."
      >
        <div className="field">
          <label>Ara (öğrenci / ders)</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Örn. 2021 veya MAT101"
          />
        </div>
        <div className="field">
          <label>Gerekçe (ret / revizyon için zorunlu)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Örn. önkoşul dersi tamamlanmamış; AKTS üst sınırı aşıldı"
          />
        </div>
        <div className="row" style={{ gap: 8, marginTop: 4 }}>
          <Button
            variant="ghost"
            sm
            icon="check"
            disabled={busy || visibleIds.length === 0}
            onClick={() => {
              const next: Record<string, boolean> = {};
              const allSelected = visibleIds.every((id) => checked[id]);
              if (!allSelected) for (const id of visibleIds) next[id] = true;
              setChecked(next);
            }}
          >
            {visibleIds.length > 0 && visibleIds.every((id) => checked[id])
              ? 'Seçimi temizle'
              : 'Görünenleri seç'}
          </Button>
          <Button
            variant="ok"
            icon="checkCircle"
            disabled={busy || selectedIds.length === 0}
            onClick={() => transition(selectedIds, 'approved')}
          >
            Seçilenleri Onayla
          </Button>
          <Button
            variant="ghost"
            icon="refresh"
            disabled={busy || selectedIds.length === 0}
            onClick={() => transition(selectedIds, 'draft')}
          >
            Revizyona Gönder
          </Button>
          <Button
            variant="danger"
            icon="alert"
            disabled={busy || selectedIds.length === 0}
            onClick={() => transition(selectedIds, 'rejected')}
          >
            Seçilenleri Reddet
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card>
          <Skeleton lines={5} />
        </Card>
      ) : groups.length === 0 ? (
        <EmptyState
          icon="checkCircle"
          title={items.length === 0 ? 'Kuyruk temiz' : 'Aramaya uyan kayıt yok'}
          sub={
            items.length === 0
              ? 'Onay bekleyen ders kaydı yok.'
              : 'Arama terimini gevşeterek tüm kuyruğu görüntüleyin.'
          }
        />
      ) : (
        groups.map((g) => {
          const isCollapsed = collapsed[g.studentId];
          const groupIds = g.rows.map((r) => r.enrollmentId);
          const allChecked = groupIds.every((id) => checked[id]);
          const flaggedInGroup = g.rows.filter(
            (r) => !r.prereqOk || !r.conflictOk || !r.quotaOk,
          ).length;
          return (
            <Card key={g.studentId}>
              <div
                className="card-head"
                style={{ alignItems: 'center', marginBottom: isCollapsed ? 0 : 6 }}
              >
                <label className="row" style={{ gap: 10, alignItems: 'center', margin: 0 }}>
                  <input
                    type="checkbox"
                    aria-label={`${g.studentNo} tüm dersleri seç`}
                    checked={allChecked}
                    onChange={(e) => {
                      setChecked((c) => {
                        const next = { ...c };
                        for (const id of groupIds) next[id] = e.target.checked;
                        return next;
                      });
                    }}
                  />
                  <h2 style={{ margin: 0 }}>
                    {g.studentNo}
                    <span
                      className="muted"
                      style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}
                    >
                      {g.fullName ?? '—'}
                    </span>
                  </h2>
                </label>
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <Badge tone="muted">{g.rows.length} ders</Badge>
                  <Badge tone="muted">{g.totalEcts} AKTS</Badge>
                  {flaggedInGroup > 0 && <Badge tone="warn">{flaggedInGroup} bayraklı</Badge>}
                  <Button
                    variant="ghost"
                    sm
                    icon={isCollapsed ? 'chevronRight' : 'chevronDown'}
                    onClick={() =>
                      setCollapsed((c) => ({ ...c, [g.studentId]: !c[g.studentId] }))
                    }
                  >
                    {isCollapsed ? 'Aç' : 'Kapat'}
                  </Button>
                </div>
              </div>
              {!isCollapsed && (
                <table style={{ marginTop: 4 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}></th>
                      <th>Ders</th>
                      <th>AKTS</th>
                      <th>Ön kontrol</th>
                      <th>Gönderim</th>
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((i) => (
                      <tr key={i.enrollmentId}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${i.courseCode} seç`}
                            checked={!!checked[i.enrollmentId]}
                            onChange={(e) =>
                              setChecked((c) => ({ ...c, [i.enrollmentId]: e.target.checked }))
                            }
                          />
                        </td>
                        <td>
                          <b>{i.courseCode}</b>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {i.courseName}
                          </div>
                        </td>
                        <td>{i.ects}</td>
                        <td>
                          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                            {flagBadge(i.prereqOk, 'Önkoşul', 'Önkoşul!')}
                            {flagBadge(i.conflictOk, 'Çakışma yok', 'Çakışma!')}
                            {flagBadge(i.quotaOk, 'Kota', 'Kota dolu!')}
                            {i.attemptNo > 1 && <Badge tone="warn">{i.attemptNo}. deneme</Badge>}
                            {i.advisorApproved && <Badge tone="muted">Onaylı kaydı var</Badge>}
                          </div>
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {fmtDateTime(i.submittedAt)}
                        </td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            <Button
                              variant="ok"
                              sm
                              disabled={busy}
                              onClick={() => transition([i.enrollmentId], 'approved')}
                            >
                              Onayla
                            </Button>
                            <Button
                              variant="ghost"
                              sm
                              disabled={busy}
                              onClick={() => transition([i.enrollmentId], 'draft')}
                            >
                              Revizyon
                            </Button>
                            <Button
                              variant="danger"
                              sm
                              disabled={busy}
                              onClick={() => transition([i.enrollmentId], 'rejected')}
                            >
                              Reddet
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          );
        })
      )}

      <div className="info-box">
        <b>Onay:</b> ders kaydı kesinleşir. <b>Revizyon:</b> kayıt öğrenciye taslak olarak döner,
        öğrenci düzeltip yeniden gönderir (kontenjan korunur). <b>Ret:</b> kayıt reddedilir ve
        kontenjan serbest bırakılır. Tüm işlemler durum makinesi + audit ile kayıt altına alınır.
      </div>
    </>
  );
}
