'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiList } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Alert,
  Skeleton,
  EmptyState,
  Segmented,
  ProgressBar,
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
interface Classroom {
  id: string;
  code: string;
  name: string;
  kind: 'derslik' | 'amfi' | 'lab';
  capacity: number;
}

const DAYS = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

const KIND_LABEL: Record<Classroom['kind'], string> = {
  derslik: 'Derslik',
  amfi: 'Amfi',
  lab: 'Laboratuvar',
};

export default function TopluDerslikAtama(): React.ReactElement {
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [classroomId, setClassroomId] = useState('');
  const [day, setDay] = useState('1');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      api<{ items: SectionRow[] }>('/portal/sections'),
      apiList<Classroom>('/facilities/classrooms'),
    ]);
    setSections(s.items ?? []);
    setClassrooms(c ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  const selectedIds = useMemo(
    () => sections.filter((s) => checked[s.sectionId]).map((s) => s.sectionId),
    [sections, checked],
  );
  const allChecked = sections.length > 0 && selectedIds.length === sections.length;

  const toggle = useCallback((id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleAll = useCallback(() => {
    setChecked(() => {
      if (allChecked) return {};
      const next: Record<string, boolean> = {};
      for (const s of sections) next[s.sectionId] = true;
      return next;
    });
  }, [allChecked, sections]);

  const selectedClassroom = useMemo(
    () => classrooms.find((c) => c.id === classroomId) ?? null,
    [classrooms, classroomId],
  );

  const assign = useCallback(async () => {
    if (selectedIds.length === 0) {
      toast('Şube seçin', { tone: 'err', body: 'En az bir şube işaretleyin.' });
      return;
    }
    if (!classroomId) {
      toast('Derslik seçin', { tone: 'err', body: 'Bir derslik seçmelisiniz.' });
      return;
    }
    if (!start.trim() || !end.trim()) {
      toast('Saat eksik', { tone: 'err', body: 'Başlangıç ve bitiş saati zorunludur.' });
      return;
    }
    const dow = Number(day);
    const body = {
      dayOfWeek: dow,
      startTime: start.trim(),
      endTime: end.trim(),
      kind: 'teorik' as const,
      classroomId,
    };

    setRunning(true);
    setProgress(0);
    let ok = 0;
    let fail = 0;
    for (const id of selectedIds) {
      try {
        await api(`/section-detail/${id}/meeting`, { method: 'POST', body });
        ok += 1;
      } catch {
        fail += 1;
      }
      setProgress(Math.round(((ok + fail) / selectedIds.length) * 100));
    }
    setRunning(false);

    if (fail === 0) {
      toast('Atama tamamlandı', {
        tone: 'ok',
        body: `${ok} şubeye ${DAYS[dow]} ${start.trim()}–${end.trim()} programı eklendi.`,
      });
    } else {
      toast('Atama kısmen tamamlandı', {
        tone: 'err',
        body: `${ok} başarılı · ${fail} başarısız.`,
      });
    }
  }, [selectedIds, classroomId, start, end, day]);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Toplu Derslik Atama"
        sub="Birden çok şubeyi işaretleyin; seçili derslik ve gün/saat programını tek seferde atayın."
      />

      {!loaded ? (
        <Skeleton lines={6} />
      ) : sections.length === 0 ? (
        <EmptyState
          icon="grade"
          title="Şube bulunmuyor"
          sub="Aktif dönemde açılmış şube yok. Önce Ders Açma ekranından şube açın."
        />
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Toplam şube', value: sections.length, icon: 'grade' },
              { label: 'Seçili şube', value: selectedIds.length, icon: 'check' },
              { label: 'Derslik sayısı', value: classrooms.length, icon: 'book' },
            ]}
          />

          <Card
            title="Atama Ayarları"
            icon="calendar"
            hint="Seçili şubelerin tümüne aynı derslik ve teorik ders programı uygulanır."
          >
            <div className="field">
              <label>Derslik</label>
              {classrooms.length === 0 ? (
                <Alert tone="warn">Tanımlı derslik bulunamadı. Önce Derslik ekranından ekleyin.</Alert>
              ) : (
                <select
                  value={classroomId}
                  onChange={(e) => setClassroomId(e.target.value)}
                  aria-label="Derslik seçin"
                >
                  <option value="">— derslik seçin —</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name} — {KIND_LABEL[c.kind]} · {c.capacity} kişi
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="field">
              <label>Gün</label>
              <Segmented
                value={day}
                onChange={setDay}
                options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: DAYS[d]! }))}
              />
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Başlangıç</label>
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Bitiş</label>
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>

            {running && (
              <div style={{ margin: '12px 0' }}>
                <ProgressBar value={progress} />
                <div className="hint-sm">Atanıyor… %{progress}</div>
              </div>
            )}

            <Button
              block
              icon="check"
              onClick={assign}
              disabled={running || selectedIds.length === 0 || !classroomId}
            >
              {running
                ? 'Atanıyor…'
                : `Toplu Ata${selectedIds.length ? ` (${selectedIds.length} şube)` : ''}`}
            </Button>
          </Card>

          <Card
            title="Şubeler"
            icon="grade"
            hint="Program atanacak şubeleri işaretleyin."
            actions={
              <Button variant="subtle" sm icon="check" onClick={toggleAll}>
                {allChecked ? 'Seçimi Kaldır' : 'Tümünü Seç'}
              </Button>
            }
          >
            <DataTable
              rows={sections}
              empty="Şube bulunamadı."
              columns={[
                {
                  key: 'sel',
                  header: '',
                  sortable: false,
                  render: (r) => (
                    <input
                      type="checkbox"
                      checked={!!checked[r.sectionId]}
                      onChange={() => toggle(r.sectionId)}
                      aria-label={`${r.courseCode} ${r.sectionCode} seç`}
                    />
                  ),
                },
                {
                  key: 'course',
                  header: 'Ders',
                  value: (r) => r.courseCode,
                  render: (r) => (
                    <span>
                      <Badge tone="muted">{r.courseCode}</Badge>
                      <span className="meta"> {r.courseName}</span>
                    </span>
                  ),
                },
                {
                  key: 'section',
                  header: 'Şube',
                  value: (r) => r.sectionCode,
                  render: (r) => <b>{r.sectionCode}</b>,
                },
                {
                  key: 'instructor',
                  header: 'Öğretim Elemanı',
                  value: (r) => r.instructorName ?? '',
                  render: (r) =>
                    r.instructorName ? r.instructorName : <span className="muted">—</span>,
                },
                {
                  key: 'status',
                  header: 'Durum',
                  value: (r) => (r.isOpen ? 'açık' : 'kapalı'),
                  render: (r) => (
                    <Badge tone={r.isOpen ? 'ok' : 'muted'}>{r.isOpen ? 'Açık' : 'Kapalı'}</Badge>
                  ),
                },
              ]}
            />
          </Card>

          {selectedClassroom && (
            <div className="info-box">
              Seçili derslik: <b>{selectedClassroom.code} · {selectedClassroom.name}</b>{' '}
              ({KIND_LABEL[selectedClassroom.kind]}, {selectedClassroom.capacity} kişi)
            </div>
          )}
        </>
      )}
    </>
  );
}
