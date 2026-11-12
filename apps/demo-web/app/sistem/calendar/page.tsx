'use client';
import { useCallback, useEffect, useState } from 'react';
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
interface Win {
  type: string;
  startsAt: string;
  endsAt: string;
}

const WIN_TR: Record<string, string> = {
  enrollment: 'Ders Kayıt',
  kayit: 'Ders Kayıt',
  grade_entry: 'Not Girişi',
  ekle_sil: 'Ekle / Bırak',
  add_drop: 'Ekle / Bırak',
  withdrawal: 'Ders Bırakma',
};

function status(w: Win, now: number): 'gelecek' | 'acik' | 'gecmis' {
  if (now < Date.parse(w.startsAt)) return 'gelecek';
  if (now > Date.parse(w.endsAt)) return 'gecmis';
  return 'acik';
}

function fmtDt(d: string): string {
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleString('tr-TR');
}

export default function TakvimDonem(): React.ReactElement {
  const [term, setTerm] = useState<Term | null>(null);
  const [windows, setWindows] = useState<Win[]>([]);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const t = await api<Term | null>('/calendar/active-term');
    setTerm(t);
    if (t?.id) {
      const w = await api<Win[]>(`/calendar/terms/${t.id}/windows`);
      setWindows([...w].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)));
    } else {
      setWindows([]);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  const now = Date.now();
  const openNow = windows.filter((w) => status(w, now) === 'acik').length;
  const upcoming = windows.filter((w) => status(w, now) === 'gelecek').length;

  return (
    <>
      <PageHeader
        title="Takvim & Dönem"
        sub="Aktif akademik dönem ve işlem pencerelerinin (kayıt/not girişi vb.) canlı durumu."
        actions={
          <Button variant="ghost" sm icon="refresh" onClick={() => load()}>
            Yenile
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {!loaded ? (
        <SkeletonStats n={4} />
      ) : !term ? (
        <Card>
          <EmptyState icon="calendar" title="Aktif dönem tanımlı değil" sub="Sistem takviminde etkin bir akademik dönem bulunamadı." />
        </Card>
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Aktif Dönem', value: term.name, icon: 'calendar' },
              { label: 'Tanımlı Pencere', value: windows.length, icon: 'layers' },
              {
                label: 'Şu An Açık',
                value: openNow,
                icon: 'clock',
                tone: openNow ? 'ok' : undefined,
              },
              {
                label: 'Yaklaşan',
                value: upcoming,
                icon: 'activity',
                tone: upcoming ? 'warn' : undefined,
              },
            ]}
          />

          <Card title="Dönem Bilgisi" icon="calendar">
            <table>
              <tbody>
                <tr>
                  <th style={{ width: 200 }}>Ad</th>
                  <td>{term.name}</td>
                </tr>
                <tr>
                  <th>Akademik Yıl / Dönem</th>
                  <td>
                    {term.year} · {term.term}
                  </td>
                </tr>
                <tr>
                  <th>Başlangıç</th>
                  <td>{fmtDate(term.startsOn)}</td>
                </tr>
                <tr>
                  <th>Bitiş</th>
                  <td>{fmtDate(term.endsOn)}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card title="İşlem Pencereleri" icon="clock">
            {windows.length === 0 ? (
              <EmptyState icon="clock" title="Tanımlı pencere yok" sub="Bu dönem için henüz işlem penceresi tanımlanmamış." />
            ) : (
              <DataTable
                rows={windows}
                search={false}
                columns={[
                  {
                    key: 'type',
                    header: 'Pencere',
                    value: (w) => WIN_TR[w.type] ?? w.type,
                    render: (w) => (
                      <div>
                        <b>{WIN_TR[w.type] ?? w.type}</b>
                        <div className="meta">{w.type}</div>
                      </div>
                    ),
                  },
                  {
                    key: 'startsAt',
                    header: 'Başlangıç',
                    value: (w) => Date.parse(w.startsAt) || 0,
                    render: (w) => fmtDt(w.startsAt),
                  },
                  {
                    key: 'endsAt',
                    header: 'Bitiş',
                    value: (w) => Date.parse(w.endsAt) || 0,
                    render: (w) => fmtDt(w.endsAt),
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    sortable: false,
                    render: (w) => {
                      const st = status(w, now);
                      return (
                        <Badge tone={st === 'acik' ? 'ok' : st === 'gelecek' ? 'warn' : 'muted'}>
                          {st === 'acik' ? 'AÇIK' : st === 'gelecek' ? 'yaklaşan' : 'kapandı'}
                        </Badge>
                      );
                    },
                  },
                ]}
              />
            )}
          </Card>

          <div className="info-box">
            Bu ekran salt-görüntülemedir. Pencere açık/kapalı durumu, öğrenci ders seçimi ve hoca
            not girişi gibi işlemleri doğrudan kısıtlar; sunucu her işlemde{' '}
            <code>/calendar/terms/:id/open</code> ile denetler.
          </div>
        </>
      )}
    </>
  );
}
