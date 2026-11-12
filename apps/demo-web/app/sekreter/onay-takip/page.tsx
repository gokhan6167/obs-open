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
  EmptyState,
  Skeleton,
  SkeletonStats,
  Alert,
  Segmented,
  Drawer,
} from '@/app/ui';

interface Req {
  id: string;
  type: string;
  status: string;
  decisionReason: string | null;
  createdAt: string;
  studentNo: string;
  payload?: Record<string, unknown> | null;
}

const TYPE_TR: Record<string, string> = {
  kayit_dondurma: 'Kayıt Dondurma',
  mazeret_sinavi: 'Mazeret Sınavı',
  belge: 'Belge Talebi',
  diger: 'Diğer',
};
const STATUS_BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  submitted: 'warn',
  in_review: 'warn',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'muted',
};
const STATUS_TR: Record<string, string> = {
  submitted: 'Beklemede (Kuyrukta)',
  in_review: 'İncelemede (Mercide)',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};

/** Talep yaşam döngüsü aşamaları — çizelge (timeline) için sıralı. */
const LIFECYCLE = ['submitted', 'in_review', 'approved'] as const;
const STAGE_LABEL: Record<string, string> = {
  submitted: 'Alındı',
  in_review: 'İncelemede',
  approved: 'Sonuçlandı',
};

/** Nerede takılı? Salt-izleme için insan-okur açıklama. */
function stuckAt(status: string): string {
  switch (status) {
    case 'submitted':
      return 'İlk değerlendirme bekliyor';
    case 'in_review':
      return 'Karar mercii inceliyor';
    case 'approved':
      return 'Sonuçlandı — onay';
    case 'rejected':
      return 'Sonuçlandı — ret';
    case 'cancelled':
      return 'Öğrenci iptal etti';
    default:
      return '—';
  }
}
function days(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}
const fmtDateTime = (s: string): string => {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
};

/** Bir talebin ulaştığı aşamayı belirle (timeline vurgusu için). */
function reachedStage(status: string): number {
  if (status === 'submitted') return 0;
  if (status === 'in_review') return 1;
  if (status === 'approved' || status === 'rejected' || status === 'cancelled') return 2;
  return 0;
}

type FilterKey =
  | 'all'
  | 'open'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'cancelled';
const FILTERS: { value: FilterKey; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'open', label: 'Açık' },
  { value: 'submitted', label: 'Beklemede' },
  { value: 'in_review', label: 'İncelemede' },
  { value: 'approved', label: 'Onaylanan' },
  { value: 'rejected', label: 'Reddedilen' },
  { value: 'cancelled', label: 'İptal' },
];

export default function OnayTakip(): React.ReactElement {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('open');
  const [sel, setSel] = useState<Req | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setReqs(await api<Req[]>('/portal/requests'));
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, [load]);

  async function refresh(): Promise<void> {
    setRefreshing(true);
    setErr('');
    try {
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setRefreshing(false);
    }
  }

  const shown = useMemo(() => {
    let list =
      filter === 'all'
        ? reqs
        : filter === 'open'
          ? reqs.filter((r) => r.status === 'submitted' || r.status === 'in_review')
          : reqs.filter((r) => r.status === filter);
    return [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [reqs, filter]);

  const c = (s: string): number => reqs.filter((r) => r.status === s).length;
  const openReqs = reqs.filter((r) => r.status === 'submitted' || r.status === 'in_review');
  const avgAge =
    openReqs.length === 0
      ? 0
      : Math.round(openReqs.reduce((s, r) => s + days(r.createdAt), 0) / openReqs.length);

  const selPayload = sel?.payload
    ? Object.entries(sel.payload).filter(([, v]) => v != null && v !== '')
    : [];

  return (
    <>
      <PageHeader
        title="Onay Takip"
        sub="Tüm talep dilekçelerinin durum listesi — hangi karar nerede takılı, salt-izleme. Bir satıra tıklayarak dilekçe ayrıntısını ve yaşam döngüsü çizelgesini görebilirsiniz. Karar verme yetkisi ilgili mercidedir; bu ekran yalnızca akışı izler."
        actions={
          <Button variant="ghost" icon="refresh" sm onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Yenileniyor…' : 'Yenile'}
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={5} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Beklemede', value: c('submitted'), icon: 'inbox', tone: c('submitted') > 0 ? 'warn' : undefined },
            { label: 'İncelemede', value: c('in_review'), icon: 'clock', tone: c('in_review') > 0 ? 'warn' : undefined },
            { label: 'Onaylandı', value: c('approved'), icon: 'checkCircle', tone: 'ok' },
            { label: 'Reddedildi', value: c('rejected'), icon: 'flag', tone: c('rejected') > 0 ? 'danger' : undefined },
            {
              label: 'Açık Ort. Yaş (gün)',
              value: avgAge,
              icon: 'activity',
              tone: avgAge >= 3 ? 'danger' : avgAge >= 1 ? 'warn' : 'ok',
            },
          ]}
        />
      )}

      <Card
        title="Talep Durum Listesi"
        icon="fileText"
        hint="En eski talep en üstte. Yaşam döngüsü çizelgesi için bir satıra tıklayın."
      >
        <Segmented value={filter} onChange={setFilter} options={FILTERS} />
        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable
            rows={shown}
            search
            csv
            csvName="onay-takip"
            pageSize={25}
            empty={<EmptyState icon="inbox" title="Talep bulunamadı" sub="Bu filtreye uygun talep yok." />}
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                value: (r) => r.studentNo,
                sortable: true,
                render: (r) => <b>{r.studentNo}</b>,
              },
              {
                key: 'type',
                header: 'Tür',
                value: (r) => TYPE_TR[r.type] ?? r.type,
                sortable: true,
              },
              {
                key: 'status',
                header: 'Durum',
                value: (r) => STATUS_TR[r.status] ?? r.status,
                sortable: true,
                render: (r) => (
                  <Badge tone={STATUS_BADGE[r.status] ?? 'muted'}>
                    {STATUS_TR[r.status] ?? r.status}
                  </Badge>
                ),
              },
              {
                key: 'stuck',
                header: 'Nerede Takılı',
                value: (r) => stuckAt(r.status),
                render: (r) => <span className="muted">{stuckAt(r.status)}</span>,
              },
              {
                key: 'age',
                header: 'Yaş',
                num: true,
                value: (r) => days(r.createdAt),
                sortable: true,
                render: (r) => {
                  const age = days(r.createdAt);
                  const isOpen = r.status === 'submitted' || r.status === 'in_review';
                  return (
                    <Badge tone={isOpen && age >= 3 ? 'danger' : isOpen && age >= 1 ? 'warn' : 'muted'}>
                      {age} gün
                    </Badge>
                  );
                },
              },
              {
                key: 'act',
                header: '',
                render: (r) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => setSel(r)}>
                    Detay
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
        title={sel ? `${sel.studentNo} · ${TYPE_TR[sel.type] ?? sel.type}` : ''}
      >
        {sel && (
          <>
            <div style={{ marginBottom: 6 }}>
              <div className="l muted" style={{ fontSize: 12, marginBottom: 6 }}>Yaşam Döngüsü</div>
              <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {LIFECYCLE.map((s, i) => {
                  const stage = reachedStage(sel.status);
                  const done = i < stage || (i === 2 && stage >= 2);
                  const current =
                    sel.status === s ||
                    (i === 2 && ['approved', 'rejected', 'cancelled'].includes(sel.status));
                  const isReject =
                    i === 2 && (sel.status === 'rejected' || sel.status === 'cancelled');
                  return (
                    <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Badge
                        tone={isReject && current ? 'danger' : current ? 'ok' : 'muted'}
                      >
                        {i === 2 && sel.status === 'rejected'
                          ? 'Reddedildi'
                          : i === 2 && sel.status === 'cancelled'
                            ? 'İptal'
                            : STAGE_LABEL[s]}
                      </Badge>
                      {i < LIFECYCLE.length - 1 && <span className="muted">→</span>}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="row" style={{ gap: 24, flexWrap: 'wrap', marginTop: 14 }}>
              <div>
                <div className="l muted" style={{ fontSize: 12 }}>Durum</div>
                <div>
                  <Badge tone={STATUS_BADGE[sel.status] ?? 'muted'}>
                    {STATUS_TR[sel.status] ?? sel.status}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="l muted" style={{ fontSize: 12 }}>Nerede Takılı</div>
                <div>{stuckAt(sel.status)}</div>
              </div>
              <div>
                <div className="l muted" style={{ fontSize: 12 }}>Başvuru</div>
                <div>{fmtDateTime(sel.createdAt)}</div>
              </div>
              <div>
                <div className="l muted" style={{ fontSize: 12 }}>Yaş</div>
                <div>{days(sel.createdAt)} gün</div>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="l muted" style={{ fontSize: 12 }}>Karar / Gerekçe</div>
              <div>{sel.decisionReason ?? 'Henüz karar yok'}</div>
            </div>

            {selPayload.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="l muted" style={{ fontSize: 12 }}>Dilekçe Ayrıntısı</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {selPayload.map(([k, v]) => (
                    <li key={k}>
                      <b>{k}:</b> {String(v)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Alert tone="info">
              Karar verme yetkisi ilgili mercidedir; bu ekran yalnızca talep akışını izler.
            </Alert>
          </>
        )}
      </Drawer>
    </>
  );
}
