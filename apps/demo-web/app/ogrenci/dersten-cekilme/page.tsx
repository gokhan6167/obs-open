'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert,
  EmptyState, Skeleton, SkeletonStats, toast, fmtDate,
} from '@/app/ui';

interface Sched {
  sectionId: string;
  courseCode: string;
  courseName: string;
  localCredit: number;
  ects: number;
  sectionCode: string;
  termName: string;
  status: string;
}
interface Req {
  id: string;
  kind: string;
  reason: string | null;
  detail: Record<string, unknown> | null;
  status: string;
  decisionNote: string | null;
  createdAt: string;
}

const STATUS_TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  incelemede: 'İncelemede',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi',
};
const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  basvuruldu: 'warn',
  incelemede: 'info',
  onaylandi: 'ok',
  reddedildi: 'danger',
};

// En az bu kadar aktif ders kalmalı; bir dönemde en fazla bu kadar çekilme talebi.
const MIN_ACTIVE = 2;
const MAX_WITHDRAW = 1;

function detailCourse(r: Req): string {
  const c = r.detail?.courseCode;
  return typeof c === 'string' && c ? c : '—';
}

export default function DerstenCekilme(): React.ReactElement {
  const [rows, setRows] = useState<Sched[] | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const loadReqs = useCallback(async () => {
    const all = await api<Req[]>('/student-requests/my');
    setReqs(all.filter((r) => r.kind === 'dersten_cekilme'));
  }, []);

  useEffect(() => {
    (async () => {
      const [sched] = await Promise.all([api<Sched[]>('/portal/schedule'), loadReqs()]);
      setRows(sched);
    })()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [loadReqs]);

  const activeTermName = rows?.[0]?.termName ?? null;
  const active = useMemo(
    () => (rows ?? []).filter((r) => r.termName === activeTermName && r.status !== 'withdrawn'),
    [rows, activeTermName],
  );

  // Bekleyen çekilme talebi olan şubeler tekrar gönderilemez.
  const pendingSections = useMemo(() => {
    const s = new Set<string>();
    for (const r of reqs) {
      if (r.status === 'basvuruldu' || r.status === 'incelemede') {
        const sid = r.detail?.sectionId;
        if (typeof sid === 'string') s.add(sid);
      }
    }
    return s;
  }, [reqs]);

  const pendingCount = pendingSections.size;
  // Kalan aktif ders sayısı, bekleyen çekilmeler düşülünce.
  const remaining = active.length - pendingCount;
  const quotaFull = pendingCount >= MAX_WITHDRAW;

  async function withdraw(s: Sched): Promise<void> {
    setBusy(s.sectionId);
    setErr('');
    try {
      await api('/student-requests', {
        method: 'POST',
        body: {
          kind: 'dersten_cekilme',
          reason: reason || undefined,
          detail: { sectionId: s.sectionId, courseCode: s.courseCode },
        },
      });
      setReason('');
      await loadReqs();
      toast('Çekilme talebi alındı', {
        tone: 'ok',
        body: `${s.courseCode} dersinden çekilme talebiniz danışman onayına düştü.`,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Talep oluşturulamadı';
      setErr(m);
      toast('Talep oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHeader
        title="Dersten Çekilme"
        sub={activeTermName ? `${activeTermName} · aktif dersleriniz` : 'Aktif dönem derslerinden çekilme talebi'}
      />

      <Alert tone="info">
        Bir dönemde en fazla <b>{MAX_WITHDRAW} ders</b> için çekilme talebi oluşturabilirsiniz.
        Çekilme sonrası dönem içinde en az <b>{MIN_ACTIVE} aktif dersiniz</b> kalmalıdır.
        Talebiniz danışman onayına düşer.
      </Alert>

      {loading ? (
        <>
          <SkeletonStats n={3} />
          <Skeleton lines={5} />
        </>
      ) : err && !rows ? (
        <Alert tone="err">{err}</Alert>
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Aktif ders', value: active.length, icon: 'book' },
              { label: 'Bekleyen çekilme', value: pendingCount, icon: 'clock', tone: pendingCount > 0 ? 'warn' : undefined },
              { label: 'Kalan hak', value: Math.max(0, MAX_WITHDRAW - pendingCount), icon: 'checkCircle' },
            ]}
          />

          {err && <Alert tone="err">{err}</Alert>}

          <Card icon="edit" title="Çekilme Gerekçesi (isteğe bağlı)">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Gerekçe</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Çekilme talebiniz için kısa gerekçe"
              />
            </div>
          </Card>

          <Card icon="book" title="Aktif Dersler">
            {active.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="Bu dönem aktif ders yok"
                sub="Çekilebilecek aktif dersiniz bulunmuyor."
              />
            ) : (
              <DataTable
                rows={active}
                search
                csv
                csvName="aktif-dersler"
                empty="Kayıt bulunamadı."
                columns={[
                  {
                    key: 'course', header: 'Ders',
                    value: (r) => `${r.courseCode} ${r.courseName}`,
                    render: (r) => (<><b>{r.courseCode}</b> · {r.courseName}</>),
                  },
                  { key: 'section', header: 'Şube', value: (r) => r.sectionCode },
                  { key: 'credit', header: 'Kredi', num: true, value: (r) => r.localCredit },
                  { key: 'ects', header: 'AKTS', num: true, value: (r) => r.ects },
                  {
                    key: 'action', header: '', sortable: false,
                    value: () => '',
                    render: (r) => {
                      const isPending = pendingSections.has(r.sectionId);
                      if (isPending) return <Badge tone="warn">Talep beklemede</Badge>;
                      const wouldBreakMin = remaining - 1 < MIN_ACTIVE;
                      const disabled = busy !== '' || quotaFull || wouldBreakMin;
                      const title = quotaFull
                        ? `Dönem başına en fazla ${MAX_WITHDRAW} çekilme talebi`
                        : wouldBreakMin
                          ? `Çekilme sonrası en az ${MIN_ACTIVE} aktif ders kalmalı`
                          : undefined;
                      return (
                        <span title={title}>
                          <Button
                            variant="danger"
                            sm
                            icon="arrowRight"
                            disabled={disabled}
                            onClick={() => void withdraw(r)}
                          >
                            {busy === r.sectionId ? 'Gönderiliyor…' : 'Geri Çek'}
                          </Button>
                        </span>
                      );
                    },
                  },
                ]}
              />
            )}
          </Card>

          <Card icon="fileText" title="Çekilme Taleplerim">
            {reqs.length === 0 ? (
              <EmptyState
                icon="fileText"
                title="Henüz çekilme talebi yok"
                sub="Yukarıdaki aktif derslerden birini geri çekerek talep oluşturabilirsiniz."
              />
            ) : (
              <DataTable
                rows={reqs}
                csv
                csvName="cekilme-taleplerim"
                empty="Kayıt bulunamadı."
                columns={[
                  { key: 'course', header: 'Ders', value: (r) => detailCourse(r), render: (r) => <b>{detailCourse(r)}</b> },
                  { key: 'createdAt', header: 'Tarih', value: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
                  {
                    key: 'status', header: 'Durum', value: (r) => STATUS_TR[r.status] ?? r.status,
                    render: (r) => <Badge tone={BADGE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>,
                  },
                  {
                    key: 'reason', header: 'Gerekçe / Karar', sortable: false,
                    value: (r) => r.decisionNote ?? r.reason ?? '',
                    render: (r) => <span className="muted">{r.decisionNote ?? r.reason ?? '—'}</span>,
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
