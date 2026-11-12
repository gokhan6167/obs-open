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
  Skeleton,
  SkeletonStats,
  ProgressBar,
  Meter,
  Drawer,
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

interface OrientationEvent {
  id: string;
  title: string;
  eventDate: string | null;
  location: string | null;
  description: string | null;
  createdAt: string;
  attendeeCount: number;
}

interface AttendanceRow {
  id: string;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  attended: boolean;
  feedback: number | null;
  createdAt: string;
}

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
}

const FEEDBACKS = [1, 2, 3, 4, 5];

export default function OryantasyonPage(): React.ReactElement {
  const [events, setEvents] = useState<OrientationEvent[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Seçili etkinlik + katılım listesi.
  const [selected, setSelected] = useState<OrientationEvent | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attErr, setAttErr] = useState('');
  const [attLoading, setAttLoading] = useState(false);

  // Yeni etkinlik sürgüsü.
  const [evOpen, setEvOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [evSaving, setEvSaving] = useState(false);
  const [evErr, setEvErr] = useState('');

  // Katılımcı ekleme sürgüsü.
  const [atOpen, setAtOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [feedback, setFeedback] = useState('');
  const [atSaving, setAtSaving] = useState(false);
  const [atErr, setAtErr] = useState('');

  const load = useCallback(async () => {
    const rows = await api<OrientationEvent[]>('/campus/orientation');
    setEvents(rows ?? []);
    return rows ?? [];
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const loadAttendance = useCallback(async (eventId: string) => {
    setAttLoading(true);
    setAttErr('');
    try {
      const rows = await api<AttendanceRow[]>(`/campus/orientation/${eventId}/attendance`);
      setAttendance(rows ?? []);
    } catch (e) {
      setAttErr(e instanceof Error ? e.message : 'Katılım listesi alınamadı');
      setAttendance([]);
    } finally {
      setAttLoading(false);
    }
  }, []);

  function selectEvent(ev: OrientationEvent): void {
    setSelected(ev);
    void loadAttendance(ev.id);
  }

  const stats = useMemo(() => {
    const total = events.reduce((s, e) => s + (e.attendeeCount ?? 0), 0);
    const withDate = events.filter((e) => e.eventDate);
    const today = new Date().toISOString().slice(0, 10);
    return {
      events: events.length,
      attendees: total,
      upcoming: withDate.filter((e) => (e.eventDate ?? '') >= today).length,
      avgPerEvent: events.length ? Math.round(total / events.length) : 0,
    };
  }, [events]);

  // Seçili etkinliğin katılım oranı + memnuniyet ortalaması.
  const detail = useMemo(() => {
    const attended = attendance.filter((a) => a.attended).length;
    const rate = attendance.length ? (attended / attendance.length) * 100 : 0;
    const scored = attendance.filter((a) => typeof a.feedback === 'number');
    const avg = scored.length
      ? scored.reduce((s, a) => s + (a.feedback ?? 0), 0) / scored.length
      : 0;
    return { attended, rate, avg, scored: scored.length };
  }, [attendance]);

  async function search(): Promise<void> {
    setSearching(true);
    setAtErr('');
    try {
      const term = q.trim();
      const res = await api<{ items: StudentHit[] }>(
        `/portal/students?q=${encodeURIComponent(term)}&pageSize=50`,
      );
      const items = res.items ?? [];
      const s = term.toLowerCase();
      setHits(
        s
          ? items.filter(
              (i) =>
                i.studentNo.toLowerCase().includes(s) || i.fullName.toLowerCase().includes(s),
            )
          : items,
      );
    } catch (e) {
      setAtErr(e instanceof Error ? e.message : 'Arama başarısız');
    } finally {
      setSearching(false);
    }
  }

  async function createEvent(): Promise<void> {
    if (!title.trim()) {
      setEvErr('Etkinlik başlığı zorunludur.');
      return;
    }
    setEvSaving(true);
    setEvErr('');
    try {
      await api('/campus/orientation', {
        method: 'POST',
        body: {
          title: title.trim(),
          ...(eventDate ? { eventDate } : {}),
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        },
      });
      toast('Etkinlik oluşturuldu', {
        tone: 'ok',
        body: `${title.trim()}${eventDate ? ` · ${fmtDate(eventDate)}` : ''}`,
      });
      closeEvent();
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setEvErr(m);
      toast('Etkinlik oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setEvSaving(false);
    }
  }

  async function addAttendance(): Promise<void> {
    if (!selected) return;
    if (!picked) {
      setAtErr('Önce öğrenci seçin.');
      return;
    }
    setAtSaving(true);
    setAtErr('');
    try {
      await api(`/campus/orientation/${selected.id}/attendance`, {
        method: 'POST',
        body: {
          studentId: picked.id,
          attended: true,
          ...(feedback ? { feedback: Number(feedback) } : {}),
        },
      });
      toast('Katılım kaydedildi', {
        tone: 'ok',
        body: `${picked.studentNo} · ${selected.title}`,
      });
      closeAttendance();
      await loadAttendance(selected.id);
      const rows = await load().catch(() => null);
      if (rows) {
        const fresh = rows.find((r) => r.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setAtErr(m);
      toast('Katılım kaydedilemedi', { tone: 'err', body: m });
    } finally {
      setAtSaving(false);
    }
  }

  function closeEvent(): void {
    setEvOpen(false);
    setTitle('');
    setEventDate('');
    setLocation('');
    setDescription('');
    setEvErr('');
  }

  function closeAttendance(): void {
    setAtOpen(false);
    setQ('');
    setHits([]);
    setPicked(null);
    setFeedback('');
    setAtErr('');
  }

  return (
    <>
      <PageHeader
        title="Oryantasyon"
        sub="Oryantasyon etkinlikleri, katılım listeleri ve öğrenci geri bildirimleri."
        actions={
          <Button icon="calendar" onClick={() => setEvOpen(true)}>
            Yeni etkinlik
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Etkinlik', value: stats.events, icon: 'calendar' },
            { label: 'Toplam katılımcı', value: stats.attendees, icon: 'users' },
            { label: 'Yaklaşan etkinlik', value: stats.upcoming, icon: 'clock', tone: 'warn' },
            { label: 'Etkinlik başına ort.', value: stats.avgPerEvent, icon: 'chart' },
          ]}
        />
      )}

      <Card title="Oryantasyon etkinlikleri" icon="calendar">
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<OrientationEvent>
            rows={events}
            search
            csv
            csvName="oidb-oryantasyon"
            empty={
              <EmptyState
                icon="calendar"
                title="Henüz oryantasyon etkinliği yok"
                sub="Sağ üstten yeni etkinlik oluşturabilirsiniz."
                action={
                  <Button icon="calendar" onClick={() => setEvOpen(true)}>
                    Yeni etkinlik
                  </Button>
                }
              />
            }
            columns={[
              {
                key: 'title',
                header: 'Başlık',
                sortable: true,
                value: (r) => r.title,
                render: (r) => <b>{r.title}</b>,
              },
              {
                key: 'eventDate',
                header: 'Tarih',
                sortable: true,
                value: (r) => r.eventDate ?? '',
                render: (r) =>
                  r.eventDate ? fmtDate(r.eventDate) : <span className="muted">—</span>,
              },
              {
                key: 'location',
                header: 'Yer',
                sortable: true,
                value: (r) => r.location ?? '',
                render: (r) => r.location ?? <span className="muted">—</span>,
              },
              {
                key: 'attendeeCount',
                header: 'Katılımcı',
                sortable: true,
                num: true,
                value: (r) => r.attendeeCount ?? 0,
                render: (r) => (
                  <Badge tone={r.attendeeCount > 0 ? 'ok' : 'muted'}>{r.attendeeCount ?? 0}</Badge>
                ),
              },
              {
                key: 'actions',
                header: '',
                sortable: false,
                render: (r) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => selectEvent(r)}>
                    Katılım
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {selected && (
        <Card
          title={`Katılım · ${selected.title}`}
          icon="users"
          hint={[selected.eventDate ? fmtDate(selected.eventDate) : null, selected.location]
            .filter(Boolean)
            .join(' · ')}
          actions={
            <div className="row">
              <Button variant="subtle" sm icon="x" onClick={() => setSelected(null)}>
                Kapat
              </Button>
              <Button sm icon="user" onClick={() => setAtOpen(true)}>
                Katılımcı ekle
              </Button>
            </div>
          }
        >
          {attErr && <Alert tone="err">{attErr}</Alert>}
          {attLoading ? (
            <Skeleton lines={6} />
          ) : attendance.length === 0 ? (
            <EmptyState
              icon="users"
              title="Bu etkinlikte katılım kaydı yok"
              sub="Öğrenci seçerek katılım kaydı ekleyebilirsiniz."
              action={
                <Button icon="user" onClick={() => setAtOpen(true)}>
                  Katılımcı ekle
                </Button>
              }
            />
          ) : (
            <>
              <div className="field">
                <label>
                  Katılım oranı · {detail.attended} / {attendance.length} öğrenci
                </label>
                <ProgressBar value={detail.rate} />
              </div>

              {detail.scored > 0 && (
                <div className="field">
                  <label>Memnuniyet ortalaması · {detail.scored} geri bildirim</label>
                  <Meter value={(detail.avg / 5) * 100} label={`${detail.avg.toFixed(1)} / 5`} />
                </div>
              )}

              <DataTable<AttendanceRow>
                rows={attendance}
                search
                csv
                csvName={`oryantasyon-katilim-${selected.id}`}
                columns={[
                  {
                    key: 'studentNo',
                    header: 'Öğrenci No',
                    sortable: true,
                    value: (r) => r.studentNo,
                    render: (r) => <b>{r.studentNo}</b>,
                  },
                  {
                    key: 'studentEmail',
                    header: 'E-posta',
                    sortable: true,
                    value: (r) => r.studentEmail,
                  },
                  {
                    key: 'attended',
                    header: 'Katılım',
                    sortable: true,
                    value: (r) => (r.attended ? 'Katıldı' : 'Katılmadı'),
                    render: (r) => (
                      <Badge tone={r.attended ? 'ok' : 'muted'}>
                        {r.attended ? 'Katıldı' : 'Katılmadı'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'feedback',
                    header: 'Geri Bildirim',
                    sortable: true,
                    num: true,
                    value: (r) => r.feedback ?? 0,
                    render: (r) =>
                      typeof r.feedback === 'number' ? (
                        <Badge tone={r.feedback >= 4 ? 'ok' : r.feedback >= 3 ? 'info' : 'warn'}>
                          {r.feedback} / 5
                        </Badge>
                      ) : (
                        <span className="muted">—</span>
                      ),
                  },
                  {
                    key: 'createdAt',
                    header: 'Kayıt Tarihi',
                    sortable: true,
                    value: (r) => r.createdAt,
                    render: (r) => fmtDate(r.createdAt),
                  },
                ]}
              />
            </>
          )}
        </Card>
      )}

      <Drawer open={evOpen} onClose={closeEvent} title="Yeni oryantasyon etkinliği">
        {evErr && <Alert tone="err">{evErr}</Alert>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void createEvent();
          }}
        >
          <div className="field">
            <label>Başlık</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn. 2025 Güz Oryantasyon Günü"
              required
            />
          </div>

          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label>Tarih</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label>Yer</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Örn. Konferans Salonu"
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: 15 }}>
            <label>Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Etkinlik programı, konuşmacılar, notlar…"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="calendar" disabled={evSaving} block>
              {evSaving ? 'Kaydediliyor…' : 'Etkinliği oluştur'}
            </Button>
          </div>
        </form>
      </Drawer>

      <Drawer
        open={atOpen}
        onClose={closeAttendance}
        title={selected ? `Katılımcı ekle · ${selected.title}` : 'Katılımcı ekle'}
      >
        {atErr && <Alert tone="err">{atErr}</Alert>}

        <h2 style={{ marginTop: 0 }}>1 · Öğrenci</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label>Öğrenci no / ad ile ara</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="20210001 veya ad"
              />
            </div>
            <Button variant="ghost" type="submit" icon="search" disabled={searching}>
              {searching ? 'Aranıyor…' : 'Ara'}
            </Button>
          </div>
        </form>

        {picked ? (
          <div className="info-box" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
              <span>
                <b>{picked.studentNo}</b> · {picked.fullName}
              </span>
              <Button variant="ghost" sm icon="refresh" onClick={() => setPicked(null)}>
                Değiştir
              </Button>
            </div>
          </div>
        ) : (
          hits.length > 0 && (
            <table style={{ marginTop: 12 }}>
              <tbody>
                {hits.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <b>{h.studentNo}</b>
                    </td>
                    <td>{h.fullName}</td>
                    <td className="muted">{h.programName}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="ghost" sm icon="check" onClick={() => setPicked(h)}>
                        Seç
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        <h2>2 · Katılım bilgisi</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addAttendance();
          }}
        >
          <div className="field">
            <label>Geri bildirim (1-5)</label>
            <select value={feedback} onChange={(e) => setFeedback(e.target.value)}>
              <option value="">Belirtilmedi</option>
              {FEEDBACKS.map((f) => (
                <option key={f} value={String(f)}>
                  {f} / 5
                </option>
              ))}
            </select>
            <div className="hint-sm">Kayıt &quot;katıldı&quot; olarak işlenir.</div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="check" disabled={atSaving || !picked} block>
              {atSaving ? 'Kaydediliyor…' : 'Katılımı kaydet'}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
