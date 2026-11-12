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
  Drawer,
  Segmented,
  Alert,
  Skeleton,
  EmptyState,
  Icon,
  toast,
} from '@/app/ui';

interface SectionRow {
  sectionId: string;
  courseCode: string;
  courseName: string;
  sectionCode: string;
  instructorName: string | null;
  quota: number;
  enrolled: number;
  fillRate: number;
  isOpen: boolean;
}
interface MeetingRow {
  id: string;
  sectionId: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  kind: string;
  classroomId: string | null;
  classroomCode: string | null;
  classroomName: string | null;
  instructorUserId: string | null;
  isMakeup: boolean;
  ykkNo: string | null;
  weekNo: number | null;
  note: string | null;
}
interface InstructorRow {
  id: string;
  sectionId: string;
  userId: string;
  email: string;
  role: string;
}
interface SectionDetail {
  meetings: MeetingRow[];
  instructors: InstructorRow[];
}
interface Advisor {
  userId: string;
  email: string;
  fullName: string;
}

const DAYS = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const dayLabel = (d: number | null): string => (d && d >= 1 && d <= 7 ? DAYS[d]! : '—');

type MeetingKind = 'teorik' | 'uygulama' | 'lab';
const KIND_OPTS: { value: MeetingKind; label: string }[] = [
  { value: 'teorik', label: 'Teorik' },
  { value: 'uygulama', label: 'Uygulama' },
  { value: 'lab', label: 'Laboratuvar' },
];
const kindLabel = (k: string): string => KIND_OPTS.find((o) => o.value === k)?.label ?? k;

type InstRole = 'sorumlu' | 'veren';
const ROLE_OPTS: { value: InstRole; label: string }[] = [
  { value: 'sorumlu', label: 'Sorumlu' },
  { value: 'veren', label: 'Dersi veren' },
];
const roleLabel = (r: string): string => ROLE_OPTS.find((o) => o.value === r)?.label ?? r;

export default function DersAcmaDetay(): React.ReactElement {
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [detail, setDetail] = useState<SectionDetail | null>(null);
  const [detailErr, setDetailErr] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  // Öğretim elemanı adaylarını lazy yükle (hem meeting hem instructor panelinde lazım)
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [advisorsErr, setAdvisorsErr] = useState('');

  // Haftalık program ekleme paneli
  const [openMeeting, setOpenMeeting] = useState(false);
  const [mDay, setMDay] = useState('1');
  const [mStart, setMStart] = useState('');
  const [mEnd, setMEnd] = useState('');
  const [mKind, setMKind] = useState<MeetingKind>('teorik');
  const [mClassroomId, setMClassroomId] = useState('');
  const [mInstructor, setMInstructor] = useState('');
  const [mMakeup, setMMakeup] = useState(false);
  const [mYkk, setMYkk] = useState('');
  const [mSaving, setMSaving] = useState(false);

  // Öğretim elemanı ekleme paneli
  const [openInst, setOpenInst] = useState(false);
  const [iUser, setIUser] = useState('');
  const [iRole, setIRole] = useState<InstRole>('sorumlu');
  const [iSaving, setISaving] = useState(false);

  const loadSections = useCallback(async () => {
    const s = await api<{ items: SectionRow[] }>('/portal/sections');
    setSections(s.items ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadSections().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [loadSections]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailErr('');
    try {
      const d = await api<SectionDetail>(`/section-detail/${id}`);
      setDetail({ meetings: d.meetings ?? [], instructors: d.instructors ?? [] });
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Detay alınamadı');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDetail(sectionId);
  }, [sectionId, loadDetail]);

  const ensureAdvisors = useCallback(async () => {
    if (advisors.length > 0) return;
    try {
      const a = await api<{ items: Advisor[] }>('/students/advisors');
      setAdvisors(a.items ?? []);
    } catch (e) {
      setAdvisorsErr(e instanceof Error ? e.message : 'Öğretim elemanı listesi alınamadı');
    }
  }, [advisors.length]);

  const selected = useMemo(
    () => sections.find((s) => s.sectionId === sectionId) ?? null,
    [sections, sectionId],
  );

  const openMeetingPanel = useCallback(() => {
    setMDay('1');
    setMStart('');
    setMEnd('');
    setMKind('teorik');
    setMClassroomId('');
    setMInstructor('');
    setMMakeup(false);
    setMYkk('');
    setOpenMeeting(true);
    void ensureAdvisors();
  }, [ensureAdvisors]);

  const openInstPanel = useCallback(() => {
    setIUser('');
    setIRole('sorumlu');
    setOpenInst(true);
    void ensureAdvisors();
  }, [ensureAdvisors]);

  const addMeeting = useCallback(async () => {
    if (!sectionId) return;
    const day = Number(mDay);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      toast('Gün seçin', { tone: 'err', body: 'Haftanın günü zorunludur.' });
      return;
    }
    if (!mStart.trim() || !mEnd.trim()) {
      toast('Saat eksik', { tone: 'err', body: 'Başlangıç ve bitiş saati zorunludur.' });
      return;
    }
    if (mMakeup && !mYkk.trim()) {
      toast('YKK no gerekli', { tone: 'err', body: 'Telafi dersi için YKK numarası zorunludur.' });
      return;
    }
    const body: Record<string, unknown> = {
      dayOfWeek: day,
      startTime: mStart.trim(),
      endTime: mEnd.trim(),
      kind: mKind,
    };
    if (mClassroomId.trim()) body.classroomId = mClassroomId.trim();
    if (mInstructor) body.instructorUserId = mInstructor;
    if (mMakeup) {
      body.isMakeup = true;
      body.ykkNo = mYkk.trim();
    }
    setMSaving(true);
    try {
      await api(`/section-detail/${sectionId}/meeting`, { method: 'POST', body });
      toast('Program satırı eklendi', {
        tone: 'ok',
        body: `${dayLabel(day)} ${mStart.trim()}–${mEnd.trim()} · ${kindLabel(mKind)}`,
      });
      setOpenMeeting(false);
      await loadDetail(sectionId);
    } catch (e) {
      toast('Eklenemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setMSaving(false);
    }
  }, [sectionId, mDay, mStart, mEnd, mKind, mClassroomId, mInstructor, mMakeup, mYkk, loadDetail]);

  const deleteMeeting = useCallback(
    async (m: MeetingRow) => {
      try {
        await api(`/section-detail/meeting/${m.id}`, { method: 'DELETE' });
        toast('Program satırı silindi', { tone: 'ok', body: `${dayLabel(m.dayOfWeek)} ${m.startTime ?? ''}` });
        await loadDetail(sectionId);
      } catch (e) {
        toast('Silinemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
      }
    },
    [sectionId, loadDetail],
  );

  const addInstructor = useCallback(async () => {
    if (!sectionId) return;
    if (!iUser) {
      toast('Öğretim elemanı seçin', { tone: 'err' });
      return;
    }
    setISaving(true);
    try {
      await api(`/section-detail/${sectionId}/instructor`, {
        method: 'POST',
        body: { userId: iUser, role: iRole },
      });
      toast('Öğretim elemanı atandı', { tone: 'ok', body: roleLabel(iRole) });
      setOpenInst(false);
      await loadDetail(sectionId);
    } catch (e) {
      toast('Atanamadı', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setISaving(false);
    }
  }, [sectionId, iUser, iRole, loadDetail]);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Ders Açma Detayı"
        sub="Bir şube seçin; haftalık ders programını ve öğretim elemanı atamalarını yönetin."
      />

      {!loaded ? (
        <Skeleton lines={5} />
      ) : sections.length === 0 ? (
        <EmptyState
          icon="grade"
          title="Şube bulunmuyor"
          sub="Aktif dönemde açılmış şube yok. Önce Ders Açma ekranından şube açın."
        />
      ) : (
        <>
          <Card title="Şube Seçimi" icon="grade">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Şube</label>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                aria-label="Şube seçin"
              >
                <option value="">— şube seçin —</option>
                {sections.map((s) => (
                  <option key={s.sectionId} value={s.sectionId}>
                    {s.courseCode} · {s.sectionCode} — {s.courseName}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          {!sectionId ? (
            <EmptyState
              icon="book"
              title="Şube seçilmedi"
              sub="Haftalık program ve öğretim elemanlarını görmek için yukarıdan bir şube seçin."
            />
          ) : detailLoading ? (
            <Skeleton lines={6} />
          ) : detailErr ? (
            <Alert tone="err">{detailErr}</Alert>
          ) : detail ? (
            <>
              {selected && (
                <StatGrid
                  stats={[
                    { label: 'Ders', value: selected.courseCode, icon: 'book' },
                    { label: 'Şube', value: selected.sectionCode, icon: 'grade' },
                    { label: 'Program satırı', value: detail.meetings.length, icon: 'clock' },
                    { label: 'Öğretim elemanı', value: detail.instructors.length, icon: 'users' },
                  ]}
                />
              )}

              <Card
                title="Haftalık Program"
                icon="calendar"
                hint="Gün, saat, tip ve derslik bilgisiyle ders çizelgesi. Telafi dersleri için YKK numarası girilir."
                actions={
                  <Button icon="calendar" onClick={openMeetingPanel}>
                    Program Satırı Ekle
                  </Button>
                }
              >
                <DataTable
                  rows={detail.meetings}
                  empty="Bu şube için henüz program satırı eklenmedi."
                  columns={[
                    {
                      key: 'day',
                      header: 'Gün',
                      value: (m) => m.dayOfWeek ?? 0,
                      render: (m) => <b>{dayLabel(m.dayOfWeek)}</b>,
                    },
                    {
                      key: 'time',
                      header: 'Saat',
                      value: (m) => m.startTime ?? '',
                      render: (m) =>
                        m.startTime || m.endTime ? (
                          <span>
                            {m.startTime ?? '—'}
                            {' – '}
                            {m.endTime ?? '—'}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        ),
                    },
                    {
                      key: 'kind',
                      header: 'Tip',
                      value: (m) => kindLabel(m.kind),
                      render: (m) => <Badge tone="muted">{kindLabel(m.kind)}</Badge>,
                    },
                    {
                      key: 'classroom',
                      header: 'Derslik',
                      value: (m) => m.classroomName ?? m.classroomCode ?? '',
                      render: (m) =>
                        m.classroomName || m.classroomCode ? (
                          <span>
                            {m.classroomCode ? <b>{m.classroomCode}</b> : null}
                            {m.classroomName ? (
                              <span className="meta"> {m.classroomName}</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="muted">atanmadı</span>
                        ),
                    },
                    {
                      key: 'makeup',
                      header: 'Telafi',
                      value: (m) => (m.isMakeup ? `telafi ${m.ykkNo ?? ''}` : ''),
                      render: (m) =>
                        m.isMakeup ? (
                          <Badge tone="warn">Telafi{m.ykkNo ? ` · YKK ${m.ykkNo}` : ''}</Badge>
                        ) : (
                          <span className="muted">—</span>
                        ),
                    },
                    {
                      key: 'action',
                      header: '',
                      sortable: false,
                      render: (m) => (
                        <Button variant="subtle" sm icon="x" onClick={() => void deleteMeeting(m)}>
                          Sil
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>

              <Card
                title="Öğretim Elemanları"
                icon="users"
                hint="Şubeye sorumlu ve dersi veren öğretim elemanlarını atayın."
                actions={
                  <Button icon="user" onClick={openInstPanel}>
                    Öğretim Elemanı Ekle
                  </Button>
                }
              >
                <DataTable
                  rows={detail.instructors}
                  empty="Bu şubeye henüz öğretim elemanı atanmadı."
                  columns={[
                    {
                      key: 'email',
                      header: 'Öğretim Elemanı',
                      value: (i) => i.email,
                      render: (i) => (
                        <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                          <Icon name="user" size={15} />
                          {i.email}
                        </span>
                      ),
                    },
                    {
                      key: 'role',
                      header: 'Rol',
                      value: (i) => roleLabel(i.role),
                      render: (i) => (
                        <Badge tone={i.role === 'sorumlu' ? 'ok' : 'muted'}>{roleLabel(i.role)}</Badge>
                      ),
                    },
                  ]}
                />
              </Card>
            </>
          ) : null}
        </>
      )}

      {/* Haftalık program satırı ekle */}
      <Drawer open={openMeeting} onClose={() => setOpenMeeting(false)} title="Program Satırı Ekle">
        <div className="field">
          <label>Gün</label>
          <select value={mDay} onChange={(e) => setMDay(e.target.value)} aria-label="Gün">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {DAYS[d]}
              </option>
            ))}
          </select>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Başlangıç</label>
            <input type="time" value={mStart} onChange={(e) => setMStart(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Bitiş</label>
            <input type="time" value={mEnd} onChange={(e) => setMEnd(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Ders Tipi</label>
          <Segmented value={mKind} onChange={setMKind} options={KIND_OPTS} />
        </div>
        <div className="field">
          <label>Derslik (opsiyonel)</label>
          <input
            value={mClassroomId}
            onChange={(e) => setMClassroomId(e.target.value)}
            placeholder="Derslik ID (UUID)"
          />
        </div>
        <div className="field">
          <label>Öğretim Elemanı (opsiyonel)</label>
          {advisorsErr ? (
            <Alert tone="warn">{advisorsErr}</Alert>
          ) : (
            <select
              value={mInstructor}
              onChange={(e) => setMInstructor(e.target.value)}
              aria-label="Öğretim elemanı"
            >
              <option value="">— seçilmedi —</option>
              {advisors.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.email}
                </option>
              ))}
            </select>
          )}
        </div>
        <label className="row" style={{ gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={mMakeup} onChange={(e) => setMMakeup(e.target.checked)} />
          Telafi dersi
        </label>
        {mMakeup && (
          <div className="field" style={{ marginTop: 10 }}>
            <label>YKK No</label>
            <input
              value={mYkk}
              onChange={(e) => setMYkk(e.target.value)}
              placeholder="Yönetim Kurulu Kararı no"
              maxLength={120}
            />
            <div className="hint-sm">Telafi dersleri için YKK numarası zorunludur.</div>
          </div>
        )}
        <Button block icon="check" onClick={addMeeting} disabled={mSaving}>
          {mSaving ? 'Ekleniyor…' : 'Program Satırı Ekle'}
        </Button>
      </Drawer>

      {/* Öğretim elemanı ekle */}
      <Drawer open={openInst} onClose={() => setOpenInst(false)} title="Öğretim Elemanı Ekle">
        <div className="field">
          <label>Öğretim Elemanı</label>
          {advisorsErr ? (
            <Alert tone="warn">{advisorsErr}</Alert>
          ) : advisors.length === 0 ? (
            <Skeleton lines={2} />
          ) : (
            <select value={iUser} onChange={(e) => setIUser(e.target.value)} aria-label="Öğretim elemanı">
              <option value="">— seçin —</option>
              {advisors.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.email}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="field">
          <label>Rol</label>
          <Segmented value={iRole} onChange={setIRole} options={ROLE_OPTS} />
        </div>
        <Button block icon="check" onClick={addInstructor} disabled={iSaving}>
          {iSaving ? 'Atanıyor…' : 'Öğretim Elemanı Ata'}
        </Button>
      </Drawer>
    </>
  );
}
