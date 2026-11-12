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
  EmptyState,
  fmtDate,
} from '@/app/ui';

interface Term {
  id: string;
  year: number;
  term: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

interface Window {
  type: string;
  startsAt: string;
  endsAt: string;
}

// Takvim pencere tiplerini (backend enum: kayit/ekle_sil/mazeret/vize/final/butunleme) Türkçeleştir.
const TYPE_TR: Record<string, string> = {
  kayit: 'Ders kayıt',
  ekle_sil: 'Ekle-sil',
  mazeret: 'Mazeret kaydı',
  vize: 'Vize sınavları',
  final: 'Final sınavları',
  butunleme: 'Bütünleme sınavları',
};

// Kısa açıklamalar — bilgi kartında pencere tiplerini anlatmak için.
const TYPE_DESC: Record<string, string> = {
  kayit: 'Öğrencilerin ders seçip danışman onayına gönderdiği ana kayıt dönemi.',
  ekle_sil: 'Kayıt sonrası ders ekleme/çıkarma yapılabilen kısa düzeltme penceresi.',
  mazeret: 'Ana kayıt dönemini kaçıran öğrenciler için mazeretli kayıt penceresi.',
  vize: 'Ara sınavların yapıldığı takvim aralığı.',
  final: 'Dönem sonu sınavlarının yapıldığı takvim aralığı.',
  butunleme: 'Final sonrası bütünleme sınavlarının yapıldığı takvim aralığı.',
};

type WinState = 'upcoming' | 'open' | 'closed';

function windowState(w: Window, nowIso: string): WinState {
  if (nowIso < w.startsAt) return 'upcoming';
  if (nowIso < w.endsAt) return 'open';
  return 'closed';
}

const STATE_TR: Record<WinState, string> = {
  upcoming: 'Yaklaşan',
  open: 'Açık',
  closed: 'Kapalı',
};
const STATE_TONE: Record<WinState, 'ok' | 'warn' | 'muted'> = {
  upcoming: 'warn',
  open: 'ok',
  closed: 'muted',
};

interface WinRow extends Window {
  state: WinState;
  label: string;
}

export default function AkademikTakvimPage(): React.ReactElement {
  const [term, setTerm] = useState<Term | null>(null);
  const [windows, setWindows] = useState<Window[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Açık/kapalı karşılaştırması için sabit "şimdi" (render'lar arası tutarlı).
  const nowIso = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    (async () => {
      const t = await api<Term | null>('/calendar/active-term');
      setTerm(t);
      if (!t) return;
      const ws = await api<Window[]>(`/calendar/terms/${t.id}/windows`);
      setWindows(ws ?? []);
    })()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo<WinRow[]>(() => {
    return windows
      .map((w) => ({
        ...w,
        state: windowState(w, nowIso),
        label: TYPE_TR[w.type] ?? w.type,
      }))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [windows, nowIso]);

  const openCount = useMemo(() => rows.filter((r) => r.state === 'open').length, [rows]);
  const upcomingCount = useMemo(
    () => rows.filter((r) => r.state === 'upcoming').length,
    [rows],
  );

  if (loading) {
    return (
      <>
        <PageHeader
          title="Akademik Takvim"
          sub="Aktif dönemin işlem pencereleri ve durumları."
        />
        <SkeletonStats n={3} />
        <Skeleton lines={8} />
      </>
    );
  }

  if (err) {
    return (
      <>
        <PageHeader
          title="Akademik Takvim"
          sub="Aktif dönemin işlem pencereleri ve durumları."
        />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }

  if (!term) {
    return (
      <>
        <PageHeader
          title="Akademik Takvim"
          sub="Aktif dönemin işlem pencereleri ve durumları."
        />
        <Card title="Aktif dönem" icon="calendar">
          <EmptyState
            icon="calendar"
            title="Aktif dönem bulunamadı"
            sub="Takvim yönetimi yalnızca aktif dönem için görüntülenir."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Akademik Takvim"
        sub={`${term.name} · aktif dönemin işlem pencereleri ve durumları.`}
      />

      <StatGrid
        stats={[
          { label: 'Toplam pencere', value: rows.length, icon: 'calendar' },
          { label: 'Şu an açık', value: openCount, icon: 'checkCircle', tone: 'ok' },
          {
            label: 'Yaklaşan',
            value: upcomingCount,
            icon: 'clock',
            tone: upcomingCount > 0 ? 'warn' : undefined,
          },
        ]}
      />

      <Card
        title="Dönem bilgisi"
        icon="calendar"
        hint={`${term.year} · ${term.term}`}
      >
        <div className="row" style={{ gap: 32, marginBottom: 0 }}>
          <div>
            <div className="muted">Dönem başlangıcı</div>
            <div style={{ fontWeight: 600 }}>{fmtDate(term.startsOn)}</div>
          </div>
          <div>
            <div className="muted">Dönem bitişi</div>
            <div style={{ fontWeight: 600 }}>{fmtDate(term.endsOn)}</div>
          </div>
        </div>
      </Card>

      <Card
        title="İşlem pencereleri"
        icon="clock"
        hint={`${rows.length} pencere`}
      >
        <DataTable<WinRow>
          rows={rows}
          search={false}
          csv
          csvName="oidb-akademik-takvim"
          empty={
            <EmptyState
              icon="calendar"
              title="Tanımlı pencere yok"
              sub="Bu dönem için henüz işlem penceresi tanımlanmamış."
            />
          }
          columns={[
            {
              key: 'label',
              header: 'Pencere',
              sortable: true,
              value: (r) => r.label,
              render: (r) => <b>{r.label}</b>,
            },
            {
              key: 'startsAt',
              header: 'Başlangıç',
              sortable: true,
              value: (r) => r.startsAt,
              render: (r) => fmtDate(r.startsAt),
            },
            {
              key: 'endsAt',
              header: 'Bitiş',
              sortable: true,
              value: (r) => r.endsAt,
              render: (r) => fmtDate(r.endsAt),
            },
            {
              key: 'state',
              header: 'Durum',
              sortable: true,
              value: (r) => STATE_TR[r.state],
              render: (r) => <Badge tone={STATE_TONE[r.state]}>{STATE_TR[r.state]}</Badge>,
            },
          ]}
        />
      </Card>

      <Card
        title="Pencere tipleri hakkında"
        icon="info"
        hint="Kayıt akışını yöneten dönemler"
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {(['kayit', 'ekle_sil', 'mazeret', 'vize', 'final', 'butunleme'] as const).map(
            (t) => (
              <div key={t} className="row" style={{ gap: 12, marginBottom: 0 }}>
                <div style={{ minWidth: 140 }}>
                  <Badge tone="info" noDot>
                    {TYPE_TR[t]}
                  </Badge>
                </div>
                <div className="muted">{TYPE_DESC[t]}</div>
              </div>
            ),
          )}
        </div>
      </Card>
    </>
  );
}
