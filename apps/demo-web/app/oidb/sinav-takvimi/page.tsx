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

type ExamType = 'vize' | 'final' | 'butunleme' | 'mazeret';
type Tab = 'sinavlar' | 'mazeret';

interface ScheduleRow {
  id: string;
  sectionId: string;
  courseCode: string;
  courseName: string;
  sectionCode: string;
  examType: ExamType;
  examDate: string;
  startTime: string;
  location: string;
}
interface MakeupRow {
  id: string;
  studentNo: string;
  fullName: string;
  courseCode: string;
  courseName: string;
  sectionCode: string;
  examType: ExamType;
  decisionNo: string;
  createdAt: string;
}
interface SectionRow {
  sectionId: string;
  courseCode: string;
  courseName: string;
  sectionCode: string;
}
interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | null;
}

const EXAM_TR: Record<ExamType, string> = {
  vize: 'Vize',
  final: 'Final',
  butunleme: 'Bütünleme',
  mazeret: 'Mazeret',
};
const EXAM_TONE: Record<ExamType, 'ok' | 'warn' | 'info' | 'muted'> = {
  vize: 'info',
  final: 'ok',
  butunleme: 'warn',
  mazeret: 'muted',
};
const EXAM_OPTS: ExamType[] = ['vize', 'final', 'butunleme', 'mazeret'];

export default function SinavTakvimi(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('sinavlar');

  // Sınav takvimi listesi
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [schLoading, setSchLoading] = useState(true);
  const [schErr, setSchErr] = useState('');

  // Mazeret listesi
  const [makeups, setMakeups] = useState<MakeupRow[]>([]);
  const [mkLoading, setMkLoading] = useState(true);
  const [mkErr, setMkErr] = useState('');

  // Şubeler (ortak)
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [secErr, setSecErr] = useState('');

  // Yeni sınav akışı
  const [schOpen, setSchOpen] = useState(false);
  const [schForm, setSchForm] = useState({
    sectionId: '',
    examType: 'vize' as ExamType,
    examDate: '',
    startTime: '',
    location: '',
  });
  const [schBusy, setSchBusy] = useState(false);

  // Yeni mazeret akışı
  const [mkOpen, setMkOpen] = useState(false);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [stLoading, setStLoading] = useState(false);
  const [stErr, setStErr] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<StudentRow | null>(null);
  const [mkForm, setMkForm] = useState({
    sectionId: '',
    examType: 'mazeret' as ExamType,
    decisionNo: '',
  });
  const [mkBusy, setMkBusy] = useState(false);

  const loadSchedules = useCallback(async () => {
    const res = await api<{ items: ScheduleRow[] } | ScheduleRow[]>('/exam/schedules');
    setSchedules(Array.isArray(res) ? res : res.items);
  }, []);

  const loadMakeups = useCallback(async () => {
    const res = await api<{ items: MakeupRow[] } | MakeupRow[]>('/exam/makeups');
    setMakeups(Array.isArray(res) ? res : res.items);
  }, []);

  const loadSections = useCallback(async () => {
    try {
      const res = await api<{ items: SectionRow[] }>('/portal/sections');
      setSections(res.items ?? []);
    } catch (e) {
      setSecErr(e instanceof Error ? e.message : 'Şube listesi alınamadı');
    }
  }, []);

  useEffect(() => {
    loadSchedules()
      .catch((e) => setSchErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setSchLoading(false));
    loadMakeups()
      .catch((e) => setMkErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setMkLoading(false));
    void loadSections();
  }, [loadSchedules, loadMakeups, loadSections]);

  const stats = useMemo(() => {
    const vize = schedules.filter((r) => r.examType === 'vize').length;
    const final = schedules.filter((r) => r.examType === 'final').length;
    const but = schedules.filter((r) => r.examType === 'butunleme').length;
    return { total: schedules.length, vize, final, but };
  }, [schedules]);

  const searchStudents = useCallback(async (term: string) => {
    setStLoading(true);
    setStErr('');
    try {
      const res = await api<{ items: StudentRow[] }>(
        `/portal/students?q=${encodeURIComponent(term)}&pageSize=20`,
      );
      setStudents(res.items);
    } catch (e) {
      setStErr(e instanceof Error ? e.message : 'Öğrenci listesi alınamadı');
    } finally {
      setStLoading(false);
    }
  }, []);

  function openSch(): void {
    setSchOpen(true);
    setSchForm({ sectionId: '', examType: 'vize', examDate: '', startTime: '', location: '' });
  }

  async function createSchedule(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!schForm.sectionId) {
      toast('Şube seçin', { tone: 'err', body: 'Sınav eklemek için bir şube seçmelisiniz.' });
      return;
    }
    setSchBusy(true);
    try {
      await api('/exam/schedules', {
        method: 'POST',
        body: {
          sectionId: schForm.sectionId,
          examType: schForm.examType,
          examDate: schForm.examDate,
          startTime: schForm.startTime,
          location: schForm.location,
        },
      });
      toast('Sınav eklendi', {
        tone: 'ok',
        body: `${EXAM_TR[schForm.examType]} · ${fmtDate(schForm.examDate)} ${schForm.startTime}`,
      });
      setSchOpen(false);
      await loadSchedules();
    } catch (er) {
      toast('Sınav eklenemedi', { tone: 'err', body: er instanceof Error ? er.message : 'Hata' });
    } finally {
      setSchBusy(false);
    }
  }

  function openMk(): void {
    setMkOpen(true);
    setPicked(null);
    setQ('');
    setStErr('');
    setMkForm({ sectionId: '', examType: 'mazeret', decisionNo: '' });
    void searchStudents('');
  }

  async function createMakeup(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!picked) return;
    if (!mkForm.sectionId) {
      toast('Şube seçin', { tone: 'err', body: 'Mazeret için bir şube seçmelisiniz.' });
      return;
    }
    setMkBusy(true);
    try {
      await api('/exam/makeups', {
        method: 'POST',
        body: {
          studentId: picked.id,
          sectionId: mkForm.sectionId,
          examType: mkForm.examType,
          decisionNo: mkForm.decisionNo,
        },
      });
      toast('Mazeret kaydedildi', {
        tone: 'ok',
        body: `${picked.studentNo} · ${EXAM_TR[mkForm.examType]} · Karar ${mkForm.decisionNo}`,
      });
      setMkOpen(false);
      await loadMakeups();
    } catch (er) {
      toast('Mazeret kaydedilemedi', { tone: 'err', body: er instanceof Error ? er.message : 'Hata' });
    } finally {
      setMkBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Sınav Takvimi & Mazeret"
        sub="Sınav programını yönetin, mazeret sınavı kararlarını kaydedin."
        actions={
          tab === 'sinavlar' ? (
            <Button variant="primary" icon="calendar" onClick={openSch}>
              Yeni Sınav
            </Button>
          ) : (
            <Button variant="primary" icon="grade" onClick={openMk}>
              Mazeret Ekle
            </Button>
          )
        }
      />

      {schLoading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam sınav', value: stats.total, icon: 'calendar' },
            { label: 'Vize', value: stats.vize, icon: 'edit' },
            { label: 'Final', value: stats.final, icon: 'checkCircle', tone: 'ok' },
            { label: 'Bütünleme', value: stats.but, icon: 'alert', tone: stats.but > 0 ? 'warn' : undefined },
          ]}
        />
      )}

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'sinavlar', label: 'Sınavlar' },
          { value: 'mazeret', label: 'Mazeret' },
        ]}
      />

      {tab === 'sinavlar' ? (
        <Card
          title="Sınav Programı"
          icon="calendar"
          hint="Yeni sınav eklemek için üstteki düğmeyi kullanın."
        >
          {schErr && <Alert tone="err">{schErr}</Alert>}
          {schLoading ? (
            <Skeleton lines={8} />
          ) : (
            <DataTable<ScheduleRow>
              rows={schedules}
              search
              csv
              csvName="oidb-sinav-takvimi"
              empty={
                <EmptyState
                  icon="calendar"
                  title="Sınav kaydı yok"
                  sub="Yeni sınav ekleyerek programı oluşturun."
                />
              }
              columns={[
                {
                  key: 'course',
                  header: 'Ders',
                  sortable: true,
                  value: (r) => `${r.courseCode} ${r.courseName}`,
                  render: (r) => (
                    <div>
                      <b>{r.courseCode}</b>
                      <div className="meta">{r.courseName}</div>
                    </div>
                  ),
                },
                {
                  key: 'sectionCode',
                  header: 'Şube',
                  sortable: true,
                  value: (r) => r.sectionCode,
                  render: (r) => <Badge tone="muted">{r.sectionCode}</Badge>,
                },
                {
                  key: 'examType',
                  header: 'Tür',
                  sortable: true,
                  value: (r) => EXAM_TR[r.examType] ?? r.examType,
                  render: (r) => <Badge tone={EXAM_TONE[r.examType]}>{EXAM_TR[r.examType] ?? r.examType}</Badge>,
                },
                {
                  key: 'examDate',
                  header: 'Tarih',
                  sortable: true,
                  value: (r) => r.examDate ?? '',
                  render: (r) => fmtDate(r.examDate),
                },
                { key: 'startTime', header: 'Saat', sortable: true, value: (r) => r.startTime ?? '' },
                {
                  key: 'location',
                  header: 'Yer',
                  sortable: true,
                  value: (r) => r.location ?? '',
                  render: (r) => r.location || <span className="muted">—</span>,
                },
              ]}
            />
          )}
        </Card>
      ) : (
        <Card
          title="Mazeret Sınavları"
          icon="grade"
          hint="Yönetim kurulu kararıyla onaylanan mazeret sınavları."
        >
          {mkErr && <Alert tone="err">{mkErr}</Alert>}
          {mkLoading ? (
            <Skeleton lines={8} />
          ) : (
            <DataTable<MakeupRow>
              rows={makeups}
              search
              csv
              csvName="oidb-mazeret-sinavlari"
              empty={
                <EmptyState
                  icon="grade"
                  title="Mazeret kaydı yok"
                  sub="Öğrenci için mazeret ekleyerek kayıt oluşturun."
                />
              }
              columns={[
                {
                  key: 'studentNo',
                  header: 'No',
                  sortable: true,
                  value: (r) => r.studentNo,
                  render: (r) => <b>{r.studentNo}</b>,
                },
                { key: 'fullName', header: 'Ad Soyad', sortable: true, value: (r) => r.fullName },
                {
                  key: 'course',
                  header: 'Ders',
                  sortable: true,
                  value: (r) => `${r.courseCode} ${r.courseName}`,
                  render: (r) => (
                    <div>
                      <b>{r.courseCode}</b>
                      <div className="meta">
                        {r.courseName} · {r.sectionCode}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'examType',
                  header: 'Tür',
                  sortable: true,
                  value: (r) => EXAM_TR[r.examType] ?? r.examType,
                  render: (r) => <Badge tone={EXAM_TONE[r.examType]}>{EXAM_TR[r.examType] ?? r.examType}</Badge>,
                },
                {
                  key: 'decisionNo',
                  header: 'Karar No',
                  sortable: true,
                  value: (r) => r.decisionNo ?? '',
                  render: (r) => r.decisionNo || <span className="muted">—</span>,
                },
                {
                  key: 'createdAt',
                  header: 'Tarih',
                  sortable: true,
                  value: (r) => r.createdAt ?? '',
                  render: (r) => fmtDate(r.createdAt),
                },
              ]}
            />
          )}
        </Card>
      )}

      {/* Yeni sınav */}
      <Drawer open={schOpen} onClose={() => setSchOpen(false)} title="Yeni Sınav">
        {secErr && <Alert tone="err">{secErr}</Alert>}
        <form onSubmit={createSchedule}>
          <div className="field">
            <label>Şube</label>
            <select
              value={schForm.sectionId}
              onChange={(e) => setSchForm((f) => ({ ...f, sectionId: e.target.value }))}
              aria-label="Şube"
              required
            >
              <option value="">— şube seçin —</option>
              {sections.map((s) => (
                <option key={s.sectionId} value={s.sectionId}>
                  {s.courseCode} · {s.courseName} ({s.sectionCode})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Sınav türü</label>
            <select
              value={schForm.examType}
              onChange={(e) => setSchForm((f) => ({ ...f, examType: e.target.value as ExamType }))}
            >
              {EXAM_OPTS.map((t) => (
                <option key={t} value={t}>
                  {EXAM_TR[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Sınav tarihi</label>
            <input
              type="date"
              value={schForm.examDate}
              onChange={(e) => setSchForm((f) => ({ ...f, examDate: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>Başlangıç saati</label>
            <input
              type="time"
              value={schForm.startTime}
              onChange={(e) => setSchForm((f) => ({ ...f, startTime: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>Yer</label>
            <input
              value={schForm.location}
              onChange={(e) => setSchForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="örn. D-201"
              required
            />
          </div>
          <Button type="submit" variant="primary" icon="check" block disabled={schBusy}>
            {schBusy ? 'Ekleniyor…' : 'Sınavı Ekle'}
          </Button>
        </form>
      </Drawer>

      {/* Yeni mazeret */}
      <Drawer open={mkOpen} onClose={() => setMkOpen(false)} title="Mazeret Ekle">
        {secErr && <Alert tone="err">{secErr}</Alert>}
        <div className="field">
          <label>Öğrenci ara</label>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              void searchStudents(e.target.value);
            }}
            placeholder="Ad veya öğrenci no…"
          />
        </div>
        {stErr && <Alert tone="err">{stErr}</Alert>}
        {stLoading ? (
          <Skeleton lines={5} />
        ) : picked ? (
          <Alert tone="ok">
            Seçili: <b>{picked.studentNo}</b> · {picked.fullName} · {picked.programName}{' '}
            <Button variant="ghost" sm onClick={() => setPicked(null)}>
              Değiştir
            </Button>
          </Alert>
        ) : students.length === 0 ? (
          <EmptyState icon="users" title="Eşleşen öğrenci yok" />
        ) : (
          <div>
            {students.map((s) => (
              <button
                key={s.id}
                type="button"
                className="list-item"
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none' }}
                onClick={() => setPicked(s)}
              >
                <span>
                  <b>{s.studentNo}</b> · {s.fullName}
                  <span className="meta">{s.programName}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {picked && (
          <form onSubmit={createMakeup} style={{ marginTop: 12 }}>
            <div className="field">
              <label>Şube</label>
              <select
                value={mkForm.sectionId}
                onChange={(e) => setMkForm((f) => ({ ...f, sectionId: e.target.value }))}
                aria-label="Şube"
                required
              >
                <option value="">— şube seçin —</option>
                {sections.map((s) => (
                  <option key={s.sectionId} value={s.sectionId}>
                    {s.courseCode} · {s.courseName} ({s.sectionCode})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Sınav türü</label>
              <select
                value={mkForm.examType}
                onChange={(e) => setMkForm((f) => ({ ...f, examType: e.target.value as ExamType }))}
              >
                {EXAM_OPTS.map((t) => (
                  <option key={t} value={t}>
                    {EXAM_TR[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Karar no</label>
              <input
                value={mkForm.decisionNo}
                onChange={(e) => setMkForm((f) => ({ ...f, decisionNo: e.target.value }))}
                placeholder="Yönetim kurulu karar no"
                required
              />
            </div>
            <Button type="submit" variant="ok" icon="check" block disabled={mkBusy}>
              {mkBusy ? 'Kaydediliyor…' : 'Mazereti Kaydet'}
            </Button>
          </form>
        )}
      </Drawer>
    </>
  );
}
