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
  SkeletonStats,
  Skeleton,
  Drawer,
  EmptyState,
  Segmented,
  toast,
  fmtDate,
} from '@/app/ui';

interface StudentRequest {
  id: string;
  studentNo: string;
  studentName: string | null;
  kind: string;
  reason: string | null;
  status: string;
  detail: Record<string, unknown> | null;
  decisionNote: string | null;
  createdAt: string;
}

const KIND_TR: Record<string, string> = {
  dersten_cekilme: 'Dersten Çekilme',
  kayit_dondurma: 'Kayıt Dondurma',
  ilisik_kesme: 'İlişik Kesme',
  ucret_iadesi: 'Ücret İadesi',
};

const STATUS_TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  incelemede: 'İncelemede',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi',
  iptal: 'İptal',
};

const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  basvuruldu: 'warn',
  incelemede: 'info',
  onaylandi: 'ok',
  reddedildi: 'danger',
  iptal: 'danger',
};

// Karar verilebilir (açık) statüler.
const OPEN = new Set(['basvuruldu', 'incelemede']);

// Segmented filtre için kind seçenekleri.
type KindFilter = 'hepsi' | 'dersten_cekilme' | 'kayit_dondurma' | 'ilisik_kesme' | 'ucret_iadesi';
const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'hepsi', label: 'Hepsi' },
  { value: 'dersten_cekilme', label: 'Dersten Çekilme' },
  { value: 'kayit_dondurma', label: 'Kayıt Dondurma' },
  { value: 'ilisik_kesme', label: 'İlişik Kesme' },
  { value: 'ucret_iadesi', label: 'Ücret İadesi' },
];

// detail jsonb içindeki bilinen alanların Türkçe etiketleri.
const DETAIL_LABEL: Record<string, string> = {
  iban: 'IBAN',
  IBAN: 'IBAN',
  donem: 'Dönem',
  sectionId: 'Ders (Section)',
};

export default function OgrenciTalepleriPage(): React.ReactElement {
  const [rows, setRows] = useState<StudentRequest[]>([]);
  const [kind, setKind] = useState<KindFilter>('hepsi');
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [detail, setDetail] = useState<StudentRequest | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (kind !== 'hepsi') qs.set('kind', kind);
    if (scope === 'open') qs.set('status', 'basvuruldu');
    const path = qs.toString() ? `/student-requests?${qs}` : '/student-requests';
    setRows(await api<StudentRequest[]>(path));
  }, [kind, scope]);

  useEffect(() => {
    setLoading(true);
    load()
      .then(() => setErr(''))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Talepler yüklenemedi'))
      .finally(() => setLoading(false));
  }, [load]);

  // scope=open filtrede yalnız açık statüler; API status paramı sadece basvuruldu
  // döndürebildiği için incelemede de kalsın diye client tarafında da süzüyoruz.
  const filtered = useMemo(
    () => (scope === 'open' ? rows.filter((r) => OPEN.has(r.status)) : rows),
    [rows, scope],
  );

  const counts = useMemo(() => {
    const open = rows.filter((r) => OPEN.has(r.status)).length;
    const today = rows.filter(
      (r) => new Date(r.createdAt).toDateString() === new Date().toDateString(),
    ).length;
    const approved = rows.filter((r) => r.status === 'onaylandi').length;
    return { open, today, approved };
  }, [rows]);

  function openDetail(r: StudentRequest): void {
    setDetail(r);
    setNote(r.decisionNote ?? '');
    setErr('');
  }

  async function decide(status: 'onaylandi' | 'reddedildi'): Promise<void> {
    if (!detail) return;
    setBusy(true);
    setErr('');
    try {
      await api(`/student-requests/${detail.id}`, {
        method: 'PATCH',
        body: { status, decisionNote: note.trim() || undefined },
      });
      toast(status === 'onaylandi' ? 'Talep onaylandı' : 'Talep reddedildi', {
        tone: status === 'onaylandi' ? 'ok' : 'err',
        body: `${detail.studentNo} · ${KIND_TR[detail.kind] ?? detail.kind}`,
      });
      setDetail(null);
      setNote('');
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İşlem başarısız';
      setErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const detailEntries = useMemo(() => {
    if (!detail?.detail) return [];
    return Object.entries(detail.detail).filter(([, v]) => v != null && v !== '');
  }, [detail]);

  return (
    <>
      <PageHeader
        title="Öğrenci Talepleri"
        sub="Dersten çekilme, kayıt dondurma, ilişik kesme ve ücret iadesi taleplerini incele, onayla veya reddet."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Açık talep',
              value: counts.open,
              icon: 'inbox',
              tone: counts.open > 0 ? 'warn' : undefined,
            },
            { label: 'Bugün gelen', value: counts.today, icon: 'activity' },
            { label: 'Onaylanmış', value: counts.approved, icon: 'checkCircle', tone: 'ok' },
          ]}
        />
      )}

      <Card title="Talep Kuyruğu" icon="inbox">
        {err && !detail && <Alert tone="err">{err}</Alert>}

        <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="field">
            <label>Tip</label>
            <Segmented value={kind} onChange={setKind} options={KIND_OPTIONS} />
          </div>
          <div className="field">
            <label>Kapsam</label>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'open', label: 'Sadece açık' },
                { value: 'all', label: 'Tümü' },
              ]}
            />
          </div>
        </div>

        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable
            rows={filtered}
            csv
            csvName="ogrenci-talepleri"
            empty={
              <EmptyState
                icon="inbox"
                title="Talep yok"
                sub="Seçili filtrelere uyan öğrenci talebi bulunmuyor."
              />
            }
            columns={[
              {
                key: 'student',
                header: 'Öğrenci',
                value: (r) => `${r.studentNo} ${r.studentName ?? ''}`.trim(),
                render: (r) => (
                  <div>
                    <b>{r.studentNo}</b>
                    {r.studentName && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.studentName}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'kind',
                header: 'Tip',
                value: (r) => KIND_TR[r.kind] ?? r.kind,
                render: (r) => KIND_TR[r.kind] ?? r.kind,
              },
              {
                key: 'reason',
                header: 'Sebep',
                value: (r) => r.reason ?? '',
                render: (r) =>
                  r.reason ? <span>{r.reason}</span> : <span className="muted">—</span>,
              },
              {
                key: 'status',
                header: 'Durum',
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={TONE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>
                ),
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                value: (r) => r.createdAt,
                render: (r) => fmtDate(r.createdAt),
              },
              {
                key: 'actions',
                header: '',
                sortable: false,
                render: (r) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => openDetail(r)}>
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
        onClose={() => {
          setDetail(null);
          setNote('');
        }}
        title={detail ? `${detail.studentNo} · ${KIND_TR[detail.kind] ?? detail.kind}` : undefined}
      >
        {detail && (
          <div className="stack" style={{ gap: 16 }}>
            {err && <Alert tone="err">{err}</Alert>}

            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge tone={TONE[detail.status] ?? 'muted'}>
                {STATUS_TR[detail.status] ?? detail.status}
              </Badge>
              <span className="muted">{fmtDate(detail.createdAt)}</span>
            </div>

            <div className="field">
              <label>Öğrenci</label>
              <div>
                <b>{detail.studentNo}</b>
                {detail.studentName ? ` · ${detail.studentName}` : ''}
              </div>
            </div>

            <div className="field">
              <label>Sebep</label>
              <div>{detail.reason || <span className="muted">—</span>}</div>
            </div>

            <div className="field">
              <label>Talep detayı</label>
              {detailEntries.length === 0 ? (
                <span className="muted">—</span>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  {detailEntries.map(([k, v]) => (
                    <div
                      key={k}
                      className="row"
                      style={{ gap: 12, marginBottom: 0, justifyContent: 'space-between' }}
                    >
                      <span className="muted">{DETAIL_LABEL[k] ?? k}</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {OPEN.has(detail.status) ? (
              <>
                <div className="field">
                  <label htmlFor="decisionNote">Karar notu (isteğe bağlı)</label>
                  <textarea
                    id="decisionNote"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Onay veya red gerekçesi…"
                  />
                </div>
                <div className="row" style={{ gap: 8, marginBottom: 0 }}>
                  <Button
                    variant="ok"
                    icon="checkCircle"
                    disabled={busy}
                    onClick={() => decide('onaylandi')}
                  >
                    Onayla
                  </Button>
                  <Button
                    variant="danger"
                    icon="x"
                    disabled={busy}
                    onClick={() => decide('reddedildi')}
                  >
                    Reddet
                  </Button>
                </div>
              </>
            ) : (
              detail.decisionNote && (
                <div className="field">
                  <label>Karar notu</label>
                  <div>{detail.decisionNote}</div>
                </div>
              )
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
