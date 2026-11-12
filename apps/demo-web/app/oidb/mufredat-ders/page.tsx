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
  Alert,
  Skeleton,
  EmptyState,
  toast,
} from '@/app/ui';

interface Program {
  id: string;
  code: string;
  name: string;
  level: string;
}
interface VersionSummary {
  id: string;
  versionId: string;
  year: number;
  name: string;
  isActive: boolean;
  courseCount: number;
  totalEcts: number;
}
interface CurriculumCourse {
  courseCode: string;
  courseName: string;
  ects: number;
  semesterNo: number;
  isMandatory: boolean;
}
interface CourseCatalog {
  id: string;
  code: string;
  nameTr: string;
  ects: number;
  localCredit: number;
}

const LEVEL_TR: Record<string, string> = {
  onlisans: 'Önlisans',
  lisans: 'Lisans',
  yuksek_lisans: 'Yüksek Lisans',
  doktora: 'Doktora',
};
const LETTERS = ['AA', 'BA', 'BB', 'CB', 'CC', 'DC', 'DD'];

export default function MufredatDers(): React.ReactElement {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState('');
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionId, setVersionId] = useState('');
  const [courses, setCourses] = useState<CurriculumCourse[]>([]);
  const [err, setErr] = useState('');
  const [loadedPrograms, setLoadedPrograms] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);

  // Ders ekleme paneli
  const [openAdd, setOpenAdd] = useState(false);
  const [catalog, setCatalog] = useState<CourseCatalog[]>([]);
  const [catErr, setCatErr] = useState('');
  const [addCourseId, setAddCourseId] = useState('');
  const [semesterNo, setSemesterNo] = useState('1');
  const [isMandatory, setIsMandatory] = useState(true);
  const [adding, setAdding] = useState(false);

  // Ön koşul paneli (yeni eklenen curriculum-course için)
  const [prereqFor, setPrereqFor] = useState<{ id: string; label: string } | null>(null);
  const [prereqCourseCode, setPrereqCourseCode] = useState('');
  const [prereqMinGrade, setPrereqMinGrade] = useState('DD');
  const [savingPrereq, setSavingPrereq] = useState(false);

  // === Yüklemeler ===
  useEffect(() => {
    api<Program[]>('/programs')
      .then((p) => {
        setPrograms(p);
        setLoadedPrograms(true);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  const loadVersions = useCallback(async (pid: string) => {
    setLoadingVersions(true);
    setVersions([]);
    setVersionId('');
    setCourses([]);
    try {
      const v = await api<VersionSummary[]>(`/programs/${pid}/curriculum-versions`);
      setVersions(v);
    } catch (e) {
      toast('Versiyonlar alınamadı', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  const loadCourses = useCallback(async (vid: string) => {
    setLoadingCourses(true);
    try {
      const c = await api<CurriculumCourse[]>(`/curriculum-versions/${vid}/courses`);
      setCourses(c);
    } catch (e) {
      toast('Dersler alınamadı', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  const onSelectProgram = useCallback(
    (pid: string) => {
      setProgramId(pid);
      if (pid) void loadVersions(pid);
      else {
        setVersions([]);
        setVersionId('');
        setCourses([]);
      }
    },
    [loadVersions],
  );

  const onSelectVersion = useCallback(
    (vid: string) => {
      setVersionId(vid);
      if (vid) void loadCourses(vid);
      else setCourses([]);
    },
    [loadCourses],
  );

  // === Ders ekleme ===
  const openAddPanel = useCallback(async () => {
    setOpenAdd(true);
    setAddCourseId('');
    setSemesterNo('1');
    setIsMandatory(true);
    setCatErr('');
    if (catalog.length === 0) {
      try {
        const c = await api<CourseCatalog[]>('/courses');
        setCatalog(c);
      } catch (e) {
        setCatErr(e instanceof Error ? e.message : 'Katalog alınamadı');
      }
    }
  }, [catalog.length]);

  const addCourse = useCallback(async () => {
    const sem = Number(semesterNo);
    if (!addCourseId || !Number.isInteger(sem) || sem < 1 || sem > 20) {
      toast('Eksik bilgi', { tone: 'err', body: 'Ders ve geçerli yarıyıl (1-20) zorunludur.' });
      return;
    }
    setAdding(true);
    try {
      const res = await api<{ id: string }>(`/curriculum-versions/${versionId}/courses`, {
        method: 'POST',
        body: { courseId: addCourseId, semesterNo: sem, isMandatory },
      });
      const cat = catalog.find((c) => c.id === addCourseId);
      toast('Ders eklendi', { tone: 'ok', body: cat ? `${cat.code} · ${cat.nameTr}` : undefined });
      setOpenAdd(false);
      await loadCourses(versionId);
      // Yeni eklenen curriculum-course için ön koşul tanımlama seçeneği sun.
      setPrereqFor({ id: res.id, label: cat ? `${cat.code} · ${cat.nameTr}` : 'Yeni ders' });
      setPrereqCourseCode('');
      setPrereqMinGrade('DD');
    } catch (e) {
      toast('Ders eklenemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setAdding(false);
    }
  }, [semesterNo, addCourseId, isMandatory, versionId, catalog, loadCourses]);

  // === Ön koşul ===
  const savePrereq = useCallback(async () => {
    if (!prereqFor) return;
    // Basit editör: tek ders + minimum harf notu → koşul ağacı; boş = kaldır.
    const prerequisite = prereqCourseCode.trim()
      ? { type: 'course', courseCode: prereqCourseCode.trim().toUpperCase(), minGrade: prereqMinGrade }
      : null;
    setSavingPrereq(true);
    try {
      await api(`/curriculum-courses/${prereqFor.id}/prerequisite`, {
        method: 'PATCH',
        body: { prerequisite },
      });
      toast(prerequisite ? 'Ön koşul kaydedildi' : 'Ön koşul kaldırıldı', { tone: 'ok' });
      setPrereqFor(null);
    } catch (e) {
      toast('Ön koşul kaydedilemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setSavingPrereq(false);
    }
  }, [prereqFor, prereqCourseCode, prereqMinGrade]);

  const activeVersion = versions.find((v) => v.id === versionId);
  const byCatalogCodes = useMemo(() => catalog.map((c) => c.code), [catalog]);

  const stats = useMemo(() => {
    const mandatory = courses.filter((c) => c.isMandatory).length;
    const totalEcts = courses.reduce((s, c) => s + c.ects, 0);
    const semesters = new Set(courses.map((c) => c.semesterNo)).size;
    return { mandatory, elective: courses.length - mandatory, totalEcts, semesters };
  }, [courses]);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Müfredata Ders & Ön Koşul"
        sub="Program ve müfredat versiyonu seçin; derslerin yarıyıl/zorunluluk yapısını ve ön koşullarını yönetin."
      />

      <Card title="Program & Versiyon" icon="layers">
        {!loadedPrograms ? (
          <Skeleton lines={2} />
        ) : (
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <div className="field" style={{ margin: 0, minWidth: 280 }}>
              <label>Program</label>
              <select
                value={programId}
                onChange={(e) => onSelectProgram(e.target.value)}
                aria-label="Program"
              >
                <option value="">— program seçin —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name} ({LEVEL_TR[p.level] ?? p.level})
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0, minWidth: 280 }}>
              <label>Müfredat Versiyonu</label>
              <select
                value={versionId}
                onChange={(e) => onSelectVersion(e.target.value)}
                aria-label="Müfredat versiyonu"
                disabled={!programId || loadingVersions}
              >
                <option value="">
                  {loadingVersions ? 'yükleniyor…' : '— versiyon seçin —'}
                </option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.year} · {v.name}
                    {v.isActive ? ' (aktif)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Card>

      {!versionId ? (
        <EmptyState
          icon="layers"
          title="Versiyon seçin"
          sub="Ders listesini görmek için önce bir program ve müfredat versiyonu seçin."
        />
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Toplam ders', value: courses.length, icon: 'book' },
              { label: 'Zorunlu', value: stats.mandatory, icon: 'checkCircle', tone: 'ok' },
              { label: 'Seçmeli', value: stats.elective, icon: 'layers' },
              { label: 'Toplam AKTS', value: stats.totalEcts, icon: 'award' },
            ]}
          />

          <Card
            title={activeVersion ? `${activeVersion.year} · ${activeVersion.name} — Dersler` : 'Dersler'}
            icon="book"
            hint={`${stats.semesters} yarıyıla dağılmış ders programı.`}
            actions={
              <Button icon="grade" sm onClick={openAddPanel}>
                Ders Ekle
              </Button>
            }
          >
            {loadingCourses ? (
              <Skeleton lines={5} />
            ) : (
              <DataTable
                rows={courses}
                csv
                csvName="mufredat-dersleri"
                empty="Bu versiyonda henüz ders tanımlı değil."
                columns={[
                  {
                    key: 'semesterNo',
                    header: 'Yarıyıl',
                    num: true,
                    value: (c) => c.semesterNo,
                    render: (c) => <Badge tone="muted">{c.semesterNo}. yy</Badge>,
                  },
                  {
                    key: 'course',
                    header: 'Ders',
                    value: (c) => `${c.courseCode} ${c.courseName}`,
                    render: (c) => (
                      <div>
                        <b>{c.courseCode}</b>
                        <div className="meta">{c.courseName}</div>
                      </div>
                    ),
                  },
                  {
                    key: 'ects',
                    header: 'AKTS',
                    num: true,
                    value: (c) => c.ects,
                  },
                  {
                    key: 'isMandatory',
                    header: 'Tür',
                    value: (c) => (c.isMandatory ? 'zorunlu' : 'seçmeli'),
                    render: (c) => (
                      <Badge tone={c.isMandatory ? 'ok' : 'info'}>
                        {c.isMandatory ? 'zorunlu' : 'seçmeli'}
                      </Badge>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}

      {/* Ders ekleme */}
      <Drawer open={openAdd} onClose={() => setOpenAdd(false)} title="Müfredata Ders Ekle">
        {catErr ? (
          <Alert tone="err">{catErr}</Alert>
        ) : catalog.length === 0 ? (
          <Skeleton lines={4} />
        ) : (
          <>
            <div className="field">
              <label>Ders</label>
              <select
                value={addCourseId}
                onChange={(e) => setAddCourseId(e.target.value)}
                aria-label="Ders"
              >
                <option value="">— ders seçin —</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.nameTr} ({c.ects} AKTS)
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Yarıyıl</label>
              <input
                type="number"
                min={1}
                max={20}
                value={semesterNo}
                onChange={(e) => setSemesterNo(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Ders Türü</label>
              <select
                value={isMandatory ? '1' : '0'}
                onChange={(e) => setIsMandatory(e.target.value === '1')}
                aria-label="Ders türü"
              >
                <option value="1">Zorunlu</option>
                <option value="0">Seçmeli</option>
              </select>
            </div>
            <Button block icon="check" onClick={addCourse} disabled={adding}>
              {adding ? 'Ekleniyor…' : 'Dersi Ekle'}
            </Button>
          </>
        )}
      </Drawer>

      {/* Ön koşul editörü (yeni eklenen ders) */}
      <Drawer open={prereqFor != null} onClose={() => setPrereqFor(null)} title="Ön Koşul Tanımla">
        {prereqFor && (
          <>
            <div className="info-box" style={{ marginTop: 0 }}>
              <b>{prereqFor.label}</b> dersi için ön koşul. Boş bırakırsanız ön koşul kaldırılır.
            </div>
            <div className="field">
              <label>Ön Koşul Ders Kodu</label>
              <input
                value={prereqCourseCode}
                onChange={(e) => setPrereqCourseCode(e.target.value)}
                placeholder="örn. MAT101"
                list="prereq-courses"
              />
              <datalist id="prereq-courses">
                {byCatalogCodes.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
              <div className="hint-sm">Bu dersi almak için geçilmesi gereken ders.</div>
            </div>
            <div className="field">
              <label>Minimum Harf Notu</label>
              <select
                value={prereqMinGrade}
                onChange={(e) => setPrereqMinGrade(e.target.value)}
                aria-label="Minimum harf notu"
              >
                {LETTERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button icon="check" onClick={savePrereq} disabled={savingPrereq}>
                {savingPrereq ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
              <Button variant="ghost" onClick={() => setPrereqFor(null)}>
                Vazgeç
              </Button>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
