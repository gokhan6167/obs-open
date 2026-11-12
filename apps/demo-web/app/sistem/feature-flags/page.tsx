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
  Alert,
  SkeletonStats,
} from '@/app/ui';

interface Term {
  id: string;
  name: string;
}
interface Win {
  type: string;
  startsAt: string;
  endsAt: string;
}
/** /calendar/terms/:id/open yanıtı — sunucunun kesin açık/kapalı kararı. */
interface OpenResp {
  type: string;
  at: string;
  open: boolean;
}

const WIN_TR: Record<string, string> = {
  enrollment: 'Ders Kayıt',
  kayit: 'Ders Kayıt',
  grade_entry: 'Not Girişi',
  ekle_sil: 'Ekle / Bırak',
  add_drop: 'Ekle / Bırak',
  withdrawal: 'Ders Bırakma',
};

// Operasyonel bir yeteneğin hangi öğrenci/personel işlemini kilitlediği.
const GATES: Record<string, string> = {
  enrollment: 'Öğrenci ders seçimi ve kayıt onayı',
  kayit: 'Öğrenci ders seçimi ve kayıt onayı',
  grade_entry: 'Öğretim elemanı not girişi ve taslak/kesinleştirme',
  ekle_sil: 'Öğrenci ekle-bırak değişiklikleri',
  add_drop: 'Öğrenci ekle-bırak değişiklikleri',
  withdrawal: 'Ders bırakma (W) işlemleri',
};

function fmtDt(d: string): string {
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleString('tr-TR');
}
function localStatus(w: Win, now: number): 'gelecek' | 'acik' | 'gecmis' {
  if (now < Date.parse(w.startsAt)) return 'gelecek';
  if (now > Date.parse(w.endsAt)) return 'gecmis';
  return 'acik';
}

export default function FeatureFlags(): React.ReactElement {
  const [term, setTerm] = useState<Term | null>(null);
  const [windows, setWindows] = useState<Win[]>([]);
  // Sunucunun her pencere tipi için kesin açık/kapalı kararı (is-open).
  const [serverOpen, setServerOpen] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const t = await api<Term | null>('/calendar/active-term');
    setTerm(t);
    if (t?.id) {
      let w: Win[] = [];
      try {
        w = await api<Win[]>(`/calendar/terms/${t.id}/windows`);
      } catch {
        w = [];
      }
      setWindows(w.slice().sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)));
      // Her benzersiz pencere tipi için sunucu kararını sor — panelin gösterdiği
      // "açık" durumu, istemci saatine değil sunucunun gerçek denetimine dayansın.
      const types = [...new Set(w.map((x) => x.type))];
      const results = await Promise.all(
        types.map(async (ty) => {
          try {
            const r = await api<OpenResp>(
              `/calendar/terms/${t.id}/open?type=${encodeURIComponent(ty)}`,
            );
            return [ty, r.open] as const;
          } catch {
            return [ty, false] as const;
          }
        }),
      );
      setServerOpen(Object.fromEntries(results));
    } else {
      setWindows([]);
      setServerOpen({});
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  const now = Date.now();
  const openCount = useMemo(
    () => windows.filter((w) => serverOpen[w.type]).length,
    [windows, serverOpen],
  );
  const upcomingCount = useMemo(
    () => windows.filter((w) => localStatus(w, now) === 'gelecek').length,
    [windows, now],
  );

  return (
    <>
      <PageHeader
        title="Feature Flag · Operasyonel Yetenekler"
        sub="Sistemin davranışını gerçekten belirleyen operasyonel yetenekler — hangi öğrenci/personel işleminin şu an açık olduğu, sunucunun kesin denetimine göre."
        actions={
          <Button variant="ghost" sm icon="refresh" onClick={() => load()}>
            Yenile
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {!loaded ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Tanımlı Yetenek Penceresi', value: windows.length, icon: 'layers' },
            {
              label: 'Şu An Açık',
              value: openCount,
              icon: 'checkCircle',
              tone: openCount ? 'ok' : undefined,
            },
            {
              label: 'Yaklaşan',
              value: upcomingCount,
              icon: 'clock',
              tone: upcomingCount ? 'warn' : undefined,
            },
          ]}
        />
      )}

      <Card
        title="Yetenek Durumu"
        icon="flag"
        hint={
          <>
            {term ? `${term.name} · ` : ''}Durum sütunu doğrudan{' '}
            <code>/calendar/terms/:id/open</code> ucundan gelir; her işlem sunucu tarafında bu
            karara göre kilitlenir.
          </>
        }
      >
        {!loaded ? (
          <p className="muted">Yükleniyor…</p>
        ) : !term ? (
          <EmptyState icon="calendar" title="Aktif dönem tanımlı değil" sub="Yetenekler akademik takvim pencereleriyle yönetilir." />
        ) : windows.length === 0 ? (
          <EmptyState icon="flag" title="Tanımlı işlem penceresi yok" sub="Aktif dönemde henüz operasyonel yetenek penceresi tanımlanmamış." />
        ) : (
          <DataTable
            rows={windows}
            search={false}
            columns={[
              {
                key: 'type',
                header: 'Yetenek',
                value: (w) => WIN_TR[w.type] ?? w.type,
                render: (w) => (
                  <div>
                    <b>{WIN_TR[w.type] ?? w.type}</b>
                    <div className="meta">
                      <code>{w.type}</code>
                    </div>
                  </div>
                ),
              },
              {
                key: 'gate',
                header: 'Kilitlediği İşlem',
                sortable: false,
                render: (w) => GATES[w.type] ?? '—',
              },
              {
                key: 'window',
                header: 'Pencere',
                sortable: false,
                render: (w) => (
                  <div className="meta">
                    {fmtDt(w.startsAt)} → {fmtDt(w.endsAt)}
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Durum (sunucu)',
                sortable: false,
                render: (w) => {
                  const open = !!serverOpen[w.type];
                  const local = localStatus(w, now);
                  return (
                    <Badge tone={open ? 'ok' : local === 'gelecek' ? 'warn' : 'muted'}>
                      {open ? 'AÇIK' : local === 'gelecek' ? 'yaklaşan' : 'kapalı'}
                    </Badge>
                  );
                },
              },
            ]}
          />
        )}
      </Card>

      <div className="info-box">
        Bu panel salt-görüntülemedir ve bilinçli olarak istemci tarafından bir yeteneği zorla açıp
        kapatmaz: yetenekler akademik takvim pencereleriyle yönetilir, açık/kapalı kararı her işlemde
        sunucuda <code>/calendar/terms/:id/open</code> ile verilir. Pencere tarihlerini güncellemek
        için Takvim &amp; Dönem ekranındaki dönem yönetimi kullanılır.
      </div>
    </>
  );
}
