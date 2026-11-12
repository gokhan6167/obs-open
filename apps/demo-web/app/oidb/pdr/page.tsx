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
  Drawer,
  EmptyState,
  Segmented,
  toast,
  fmtDate,
} from '@/app/ui';

// GET /wellbeing/counseling -> { items: [...] } (dar personel; not alanı dahil)
interface Counseling {
  id: string;
  studentId: string;
  studentNo: string;
  studentEmail: string | null;
  counselorUserId: string | null;
  requestedAt: string;
  appointmentAt: string | null;
  kind: string;
  status: string;
  note: string | null;
  rating: number | null;
  createdAt: string;
}

// GET /portal/students -> { items: [...] } (öğrenci adı için eşleme)
interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
}

const KIND_TR: Record<string, string> = {
  bireysel: 'Bireysel Görüşme',
  grup: 'Grup Görüşmesi',
  atolye: 'Atölye',
};

const STATUS_TR: Record<string, string> = {
  talep: 'Talep',
  planlandi: 'Planlandı',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
  gelmedi: 'Gelmedi',
};

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  talep: 'warn',
  planlandi: 'info',
  tamamlandi: 'ok',
  iptal: 'muted',
  gelmedi: 'danger',
};

type StatusFilter = 'hepsi' | 'talep' | 'planlandi' | 'tamamlandi' | 'gelmedi';
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'hepsi', label: 'Hepsi' },
  { value: 'talep', label: 'Talep' },
  { value: 'planlandi', label: 'Planlandı' },
  { value: 'tamamlandi', label: 'Tamamlandı' },
  { value: 'gelmedi', label: 'Gelmedi' },
];

const FORBIDDEN_MSG = 'Bu modül için yetkiniz yok';

/** API yalnızca mesaj fırlattığı için 403'ü sunucu metninden ayırt ediyoruz. */
function isForbidden(e: unknown): boolean {
  const m = e instanceof Error ? e.message : '';
  return /yetkiniz yok|erişim yetkiniz/i.test(m);
}

/** ISO -> datetime-local input değeri (YYYY-MM-DDTHH:mm, yerel saat). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PdrPage(): React.ReactElement {
  const [rows, setRows] = useState<Counseling[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<StatusFilter>('hepsi');
  const [detail, setDetail] = useState<Counseling | null>(null);
  const [appointment, setAppointment] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ items: Counseling[] }>('/wellbeing/counseling');
    setRows(res.items);
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .then(() => {
        setErr('');
        setForbidden(false);
      })
      .catch((e) => {
        if (isForbidden(e)) {
          setForbidden(true);
          setErr('');
        } else {
          setErr(e instanceof Error ? e.message : 'PDR kayıtları yüklenemedi');
        }
      })
      .finally(() => setLoading(false));
  }, [load]);

  // Öğrenci adı listede dönmüyor; ad eşlemesi için ayrı çağrı (başarısızsa no gösterilir).
  useEffect(() => {
    api<{ items: StudentRow[] }>('/portal/students?pageSize=100')
      .then((res) => {
        const map: Record<string, string> = {};
        for (const s of res.items) map[s.id] = s.fullName;
        setNames(map);
      })
      .catch(() => setNames({}));
  }, []);

  const filtered = useMemo(
    () => (filter === 'hepsi' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const counts = useMemo(() => {
    const by = (s: string): number => rows.filter((r) => r.status === s).length;
    return {
      talep: by('talep'),
      planlandi: by('planlandi'),
      tamamlandi: by('tamamlandi'),
      gelmedi: by('gelmedi'),
    };
  }, [rows]);

  function openDetail(r: Counseling): void {
    setDetail(r);
    setAppointment(toLocalInput(r.appointmentAt));
    setNote(r.note ?? '');
    setErr('');
  }

  function closeDrawer(): void {
    setDetail(null);
    setAppointment('');
    setNote('');
  }

  async function patch(
    body: { appointmentAt?: string; status?: string; note?: string },
    okTitle: string,
  ): Promise<void> {
    if (!detail) return;
    setBusy(true);
    setErr('');
    try {
      await api(`/wellbeing/counseling/${detail.id}`, { method: 'PATCH', body });
      toast(okTitle, { tone: 'ok', body: `${detail.studentNo} · ${KIND_TR[detail.kind] ?? detail.kind}` });
      closeDrawer();
      await load();
    } catch (e) {
      const m = isForbidden(e) ? FORBIDDEN_MSG : e instanceof Error ? e.message : 'İşlem başarısız';
      setErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function plan(): Promise<void> {
    if (!appointment) {
      setErr('Randevu tarih ve saati seçin.');
      return;
    }
    const d = new Date(appointment);
    if (Number.isNaN(d.getTime())) {
      setErr('Geçersiz randevu tarihi.');
      return;
    }
    await patch({ appointmentAt: d.toISOString(), status: 'planlandi' }, 'Randevu planlandı');
  }

  return (
    <>
      <PageHeader
        title="Psikolojik Danışmanlık (PDR)"
        sub="Öğrenci danışmanlık taleplerini planlayın, görüşme sonucunu işleyin ve gizli danışman notunu kaydedin."
      />

      <Alert tone="warn">
        Bu ekrandaki kayıtlar hassas kişisel veridir; erişim dar yetki setiyle sınırlıdır ve
        loglanır.
      </Alert>

      {forbidden ? (
        <Alert tone="err">{FORBIDDEN_MSG}</Alert>
      ) : (
        <>
          {loading ? (
            <SkeletonStats n={4} />
          ) : (
            <StatGrid
              stats={[
                {
                  label: 'Talep',
                  value: counts.talep,
                  icon: 'inbox',
                  tone: counts.talep > 0 ? 'warn' : undefined,
                },
                { label: 'Planlandı', value: counts.planlandi, icon: 'calendar' },
                { label: 'Tamamlandı', value: counts.tamamlandi, icon: 'checkCircle', tone: 'ok' },
                {
                  label: 'Gelmedi',
                  value: counts.gelmedi,
                  icon: 'alert',
                  tone: counts.gelmedi > 0 ? 'danger' : undefined,
                },
              ]}
            />
          )}

          <Card title="Danışmanlık Kayıtları" icon="shield">
            {err && !detail && <Alert tone="err">{err}</Alert>}

            <div className="field">
              <label>Durum</label>
              <Segmented value={filter} onChange={setFilter} options={STATUS_OPTIONS} />
            </div>

            {loading ? (
              <Skeleton lines={6} />
            ) : (
              <DataTable
                rows={filtered}
                empty={
                  <EmptyState
                    icon="inbox"
                    title="Kayıt yok"
                    sub="Seçili duruma uyan danışmanlık kaydı bulunmuyor."
                  />
                }
                columns={[
                  {
                    key: 'student',
                    header: 'Öğrenci',
                    value: (r) => `${r.studentNo} ${names[r.studentId] ?? r.studentEmail ?? ''}`.trim(),
                    render: (r) => (
                      <div>
                        <b>{r.studentNo}</b>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {names[r.studentId] ?? r.studentEmail ?? '—'}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'kind',
                    header: 'Tür',
                    value: (r) => KIND_TR[r.kind] ?? r.kind,
                    render: (r) => KIND_TR[r.kind] ?? r.kind,
                  },
                  {
                    key: 'requestedAt',
                    header: 'Talep Tarihi',
                    value: (r) => r.requestedAt,
                    render: (r) => fmtDate(r.requestedAt),
                  },
                  {
                    key: 'appointmentAt',
                    header: 'Randevu',
                    value: (r) => r.appointmentAt ?? '',
                    render: (r) =>
                      r.appointmentAt ? (
                        fmtDate(r.appointmentAt)
                      ) : (
                        <span className="muted">Planlanmadı</span>
                      ),
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    value: (r) => STATUS_TR[r.status] ?? r.status,
                    render: (r) => (
                      <Badge tone={STATUS_TONE[r.status] ?? 'muted'}>
                        {STATUS_TR[r.status] ?? r.status}
                      </Badge>
                    ),
                  },
                  {
                    key: 'rating',
                    header: 'Puan',
                    num: true,
                    value: (r) => r.rating ?? 0,
                    render: (r) =>
                      r.rating != null ? `${r.rating}/5` : <span className="muted">—</span>,
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
        </>
      )}

      <Drawer
        open={!!detail}
        onClose={closeDrawer}
        title={detail ? `${detail.studentNo} · ${KIND_TR[detail.kind] ?? detail.kind}` : undefined}
      >
        {detail && (
          <div className="stack" style={{ gap: 16 }}>
            {err && <Alert tone="err">{err}</Alert>}

            <div className="row" style={{ gap: 8, marginBottom: 0 }}>
              <Badge tone={STATUS_TONE[detail.status] ?? 'muted'}>
                {STATUS_TR[detail.status] ?? detail.status}
              </Badge>
              <span className="muted">Talep: {fmtDate(detail.requestedAt)}</span>
            </div>

            <div className="field">
              <label>Öğrenci</label>
              <div>
                <b>{detail.studentNo}</b>
                {names[detail.studentId] ? ` · ${names[detail.studentId]}` : ''}
              </div>
              <div className="hint-sm">{detail.studentEmail ?? '—'}</div>
            </div>

            <div className="field">
              <label htmlFor="appointmentAt">Randevu tarihi / saati</label>
              <input
                id="appointmentAt"
                type="datetime-local"
                value={appointment}
                onChange={(e) => setAppointment(e.target.value)}
              />
              <div className="hint-sm">Kaydetmek randevuyu &quot;Planlandı&quot; durumuna alır.</div>
            </div>

            <div className="row" style={{ gap: 8, marginBottom: 0 }}>
              <Button variant="primary" icon="calendar" disabled={busy} onClick={plan}>
                Randevu planla
              </Button>
              <Button
                variant="ok"
                icon="checkCircle"
                disabled={busy}
                onClick={() => patch({ status: 'tamamlandi' }, 'Görüşme tamamlandı')}
              >
                Tamamla
              </Button>
              <Button
                variant="danger"
                icon="alert"
                disabled={busy}
                onClick={() => patch({ status: 'gelmedi' }, 'Gelmedi olarak işaretlendi')}
              >
                Gelmedi
              </Button>
              <Button
                variant="subtle"
                icon="x"
                disabled={busy}
                onClick={() => patch({ status: 'iptal' }, 'Randevu iptal edildi')}
              >
                İptal et
              </Button>
            </div>

            <div className="field">
              <label htmlFor="note">Gizli danışman notu</label>
              <textarea
                id="note"
                rows={5}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Yalnızca yetkili PDR personeli görür; öğrenciye gösterilmez…"
              />
              <div className="hint-sm">
                Not öğrenci uçlarına hiçbir koşulda dönülmez; kayıt erişimi loglanır.
              </div>
            </div>

            <div className="row" style={{ marginBottom: 0 }}>
              <Button
                variant="primary"
                icon="edit"
                disabled={busy}
                onClick={() => patch({ note: note.trim() }, 'Gizli not kaydedildi')}
              >
                Notu kaydet
              </Button>
            </div>

            {detail.rating != null && (
              <div className="field">
                <label>Öğrenci puanı</label>
                <div>{detail.rating}/5</div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
