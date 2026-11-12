'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Alert,
  Segmented,
  Drawer,
  toast,
  Icon,
} from '@/app/ui';

/* ============================================================================
   Akademik Yapı · Üniversite > Fakülte > Bölüm > Program > Müfredat
   Tek çağrıda ağaç (GET /academic-structure/tree); seviyeler tıklanarak açılır.
   Yazma işlemleri ACADEMIC_ADMIN'e açıktır (403 -> uyarı, 409 -> kod çakışması).
   ========================================================================== */

type Level = 'onlisans' | 'lisans' | 'yuksek_lisans' | 'doktora';

interface ProgramNode {
  id: string;
  code: string;
  name: string;
  level: string;
  language: string | null;
  educationModel: string | null;
  studentCount: number;
}
interface DepartmentNode {
  id: string;
  code: string;
  name: string;
  programs: ProgramNode[];
}
interface FacultyNode {
  id: string;
  code: string;
  name: string;
  departments: DepartmentNode[];
}
interface CurriculumVersion {
  id: string;
  programId: string;
  year: number;
  name: string;
  isActive: boolean;
}

const LEVEL_TR: Record<string, string> = {
  onlisans: 'Önlisans',
  lisans: 'Lisans',
  yuksek_lisans: 'Yüksek Lisans',
  doktora: 'Doktora',
};
const LEVEL_OPTS: { value: Level; label: string }[] = [
  { value: 'onlisans', label: 'Önlisans' },
  { value: 'lisans', label: 'Lisans' },
  { value: 'yuksek_lisans', label: 'Y. Lisans' },
  { value: 'doktora', label: 'Doktora' },
];

/** Backend ForbiddenException mesajı ("... yetkiniz yok") veya ham 403. */
const isForbidden = (e: unknown): boolean =>
  e instanceof Error && /yetkiniz yok|yetki|403/i.test(e.message);
/** ConflictException: aynı kod/yıl ile ikinci kayıt (409). */
const isDuplicate = (e: unknown): boolean =>
  e instanceof Error && /zaten var|409/i.test(e.message);
const msgOf = (e: unknown): string => (e instanceof Error ? e.message : 'Beklenmeyen hata');

/** Ağaçta seçilebilir satır (fakülte/bölüm/program ortak görünümü). */
function PickRow({
  active,
  icon,
  title,
  sub,
  right,
  onClick,
}: {
  active: boolean;
  icon: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  onClick: () => void;
}): React.ReactElement {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="list-item"
      style={{
        cursor: 'pointer',
        alignItems: 'center',
        padding: '11px 12px',
        marginBottom: 6,
        borderRadius: 11,
        borderBottom: 'none',
        background: active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line-2)'}`,
      }}
    >
      <div className="row" style={{ gap: 10, flexWrap: 'nowrap', minWidth: 0 }}>
        <span className="li-ico">
          <Icon name={icon} size={17} />
        </span>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 13.5 }}>{title}</b>
          {sub ? <div className="meta">{sub}</div> : null}
        </div>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        {right}
        <Icon name="chevronRight" size={15} />
      </div>
    </div>
  );
}

export default function AkademikYapi(): React.ReactElement {
  const [tree, setTree] = useState<FacultyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [err, setErr] = useState('');

  const [facultyId, setFacultyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  // Ekleme panelleri
  const [openFaculty, setOpenFaculty] = useState(false);
  const [openDepartment, setOpenDepartment] = useState(false);
  const [openProgram, setOpenProgram] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [level, setLevel] = useState<Level>('lisans');

  // Müfredat paneli
  const [curProgram, setCurProgram] = useState<ProgramNode | null>(null);
  const [versions, setVersions] = useState<CurriculumVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [curErr, setCurErr] = useState('');
  const [curYear, setCurYear] = useState(String(new Date().getFullYear()));
  const [curName, setCurName] = useState('');
  const [curActive, setCurActive] = useState(true);
  const [savingCur, setSavingCur] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: FacultyNode[] }>('/academic-structure/tree');
      setTree(res.items);
      setDenied(false);
      setErr('');
    } catch (e) {
      if (isForbidden(e)) setDenied(true);
      else setErr(msgOf(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const faculty = useMemo(() => tree.find((f) => f.id === facultyId) ?? null, [tree, facultyId]);
  const department = useMemo(
    () => faculty?.departments.find((d) => d.id === departmentId) ?? null,
    [faculty, departmentId],
  );

  const stats = useMemo(() => {
    let deps = 0;
    let progs = 0;
    let students = 0;
    for (const f of tree) {
      deps += f.departments.length;
      for (const d of f.departments) {
        progs += d.programs.length;
        for (const p of d.programs) students += p.studentCount;
      }
    }
    return { faculties: tree.length, deps, progs, students };
  }, [tree]);

  const selectFaculty = useCallback((id: string) => {
    setFacultyId((cur) => (cur === id ? '' : id));
    setDepartmentId('');
  }, []);

  /* --------------------------- Ekleme işlemleri --------------------------- */

  const resetForm = useCallback(() => {
    setCode('');
    setName('');
    setLevel('lisans');
    setFormErr('');
  }, []);

  /** POST sonrası ortak hata çevirisi: 409 kod çakışması, 403 yetki. */
  const handleWriteError = useCallback((e: unknown, what: string): void => {
    if (isForbidden(e)) {
      setFormErr('Bu işlem için yetkiniz yok');
      toast('Yetkiniz yok', { tone: 'err', body: `${what} işlemi akademik yönetici yetkisi ister.` });
      return;
    }
    if (isDuplicate(e)) {
      setFormErr(`${msgOf(e)} — farklı bir kod girin.`);
      toast('Kod zaten kullanımda', { tone: 'err', body: msgOf(e) });
      return;
    }
    setFormErr(msgOf(e));
    toast(`${what} başarısız`, { tone: 'err', body: msgOf(e) });
  }, []);

  const createFaculty = useCallback(async () => {
    if (!code.trim() || !name.trim()) {
      setFormErr('Kod ve ad zorunludur.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      const row = await api<{ id: string }>('/academic-structure/faculties', {
        method: 'POST',
        body: { code: code.trim(), name: name.trim() },
      });
      toast('Fakülte eklendi', { tone: 'ok', body: `${code.trim()} · ${name.trim()}` });
      setOpenFaculty(false);
      resetForm();
      await load();
      setFacultyId(row.id);
      setDepartmentId('');
    } catch (e) {
      handleWriteError(e, 'Fakülte ekleme');
    } finally {
      setSaving(false);
    }
  }, [code, name, load, resetForm, handleWriteError]);

  const createDepartment = useCallback(async () => {
    if (!faculty) return;
    if (!code.trim() || !name.trim()) {
      setFormErr('Kod ve ad zorunludur.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      const row = await api<{ id: string }>('/academic-structure/departments', {
        method: 'POST',
        body: { facultyId: faculty.id, code: code.trim(), name: name.trim() },
      });
      toast('Bölüm eklendi', { tone: 'ok', body: `${faculty.name} › ${name.trim()}` });
      setOpenDepartment(false);
      resetForm();
      await load();
      setDepartmentId(row.id);
    } catch (e) {
      handleWriteError(e, 'Bölüm ekleme');
    } finally {
      setSaving(false);
    }
  }, [faculty, code, name, load, resetForm, handleWriteError]);

  const createProgram = useCallback(async () => {
    if (!department) return;
    if (!code.trim() || !name.trim()) {
      setFormErr('Kod ve ad zorunludur.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api('/academic-structure/programs', {
        method: 'POST',
        body: { departmentId: department.id, code: code.trim(), name: name.trim(), level },
      });
      toast('Program eklendi', { tone: 'ok', body: `${department.name} › ${name.trim()}` });
      setOpenProgram(false);
      resetForm();
      await load();
    } catch (e) {
      handleWriteError(e, 'Program ekleme');
    } finally {
      setSaving(false);
    }
  }, [department, code, name, level, load, resetForm, handleWriteError]);

  /* ----------------------------- Müfredat ----------------------------- */

  const openCurriculum = useCallback(async (p: ProgramNode) => {
    setCurProgram(p);
    setVersions([]);
    setCurErr('');
    setCurName('');
    setCurYear(String(new Date().getFullYear()));
    setCurActive(true);
    setLoadingVersions(true);
    try {
      const res = await api<{ items: CurriculumVersion[] }>(
        `/academic-structure/programs/${p.id}/curriculum-versions`,
      );
      setVersions(res.items);
    } catch (e) {
      setCurErr(isForbidden(e) ? 'Bu işlem için yetkiniz yok' : msgOf(e));
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  const createVersion = useCallback(async () => {
    if (!curProgram) return;
    const year = Number(curYear);
    if (!Number.isInteger(year) || year < 1900 || year > 2200 || !curName.trim()) {
      setCurErr('Geçerli bir yıl (1900-2200) ve versiyon adı zorunludur.');
      return;
    }
    setSavingCur(true);
    setCurErr('');
    try {
      await api(`/academic-structure/programs/${curProgram.id}/curriculum-versions`, {
        method: 'POST',
        body: { year, name: curName.trim(), isActive: curActive },
      });
      toast('Müfredat versiyonu eklendi', { tone: 'ok', body: `${year} · ${curName.trim()}` });
      setCurName('');
      const res = await api<{ items: CurriculumVersion[] }>(
        `/academic-structure/programs/${curProgram.id}/curriculum-versions`,
      );
      setVersions(res.items);
    } catch (e) {
      if (isForbidden(e)) {
        setCurErr('Bu işlem için yetkiniz yok');
        toast('Yetkiniz yok', { tone: 'err' });
      } else if (isDuplicate(e)) {
        setCurErr(`${msgOf(e)} — farklı bir yıl seçin.`);
        toast('Yıl zaten tanımlı', { tone: 'err', body: msgOf(e) });
      } else {
        setCurErr(msgOf(e));
        toast('Versiyon eklenemedi', { tone: 'err', body: msgOf(e) });
      }
    } finally {
      setSavingCur(false);
    }
  }, [curProgram, curYear, curName, curActive]);

  /* ------------------------------ Görünüm ------------------------------ */

  if (denied) {
    return (
      <>
        <PageHeader title="Akademik Yapı" sub="Fakülte, bölüm, program ve müfredat hiyerarşisi." />
        <Card title="Erişim kısıtlı" icon="shield">
          <Alert tone="err">Bu işlem için yetkiniz yok</Alert>
          <EmptyState
            icon="shield"
            title="Akademik yapı görüntülenemiyor"
            sub="Bu modül üniversite personeline açıktır. Yetkilendirme için sistem yöneticinize başvurun."
          />
        </Card>
      </>
    );
  }

  if (err) {
    return (
      <>
        <PageHeader title="Akademik Yapı" sub="Fakülte, bölüm, program ve müfredat hiyerarşisi." />
        <Alert tone="err">{err}</Alert>
        <Button icon="refresh" onClick={() => void load()}>
          Tekrar dene
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Akademik Yapı"
        sub="Üniversite › Fakülte › Bölüm › Program › Müfredat. Bir seviyeye tıklayarak alt kırılımı açın."
        actions={
          <>
            <Button
              variant="ghost"
              icon="refresh"
              sm
              onClick={() => void load()}
              disabled={loading}
            >
              Yenile
            </Button>
            <Button
              icon="building"
              sm
              onClick={() => {
                resetForm();
                setOpenFaculty(true);
              }}
            >
              Fakülte Ekle
            </Button>
          </>
        }
      />

      <StatGrid
        stats={[
          { label: 'Fakülte', value: stats.faculties, icon: 'building' },
          { label: 'Bölüm', value: stats.deps, icon: 'layers' },
          { label: 'Program', value: stats.progs, icon: 'book' },
          { label: 'Öğrenci', value: stats.students, icon: 'users', tone: 'ok' },
        ]}
      />

      {loading ? (
        <Card title="Fakülteler" icon="building">
          <Skeleton lines={6} />
        </Card>
      ) : tree.length === 0 ? (
        <EmptyState
          icon="building"
          title="Henüz fakülte tanımlı değil"
          sub="Akademik yapıyı kurmak için önce bir fakülte ekleyin."
          action={
            <Button
              icon="building"
              onClick={() => {
                resetForm();
                setOpenFaculty(true);
              }}
            >
              Fakülte Ekle
            </Button>
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* --- Fakülteler --- */}
          <Card
            title="Fakülteler"
            icon="building"
            hint={`${tree.length} fakülte. Bölümleri görmek için seçin.`}
          >
            {tree.map((f) => (
              <PickRow
                key={f.id}
                active={f.id === facultyId}
                icon="building"
                title={`${f.code} · ${f.name}`}
                sub={`${f.departments.length} bölüm`}
                right={
                  <Badge tone="muted">
                    {f.departments.reduce((s, d) => s + d.programs.length, 0)} program
                  </Badge>
                }
                onClick={() => selectFaculty(f.id)}
              />
            ))}
          </Card>

          {/* --- Bölümler --- */}
          <Card
            title="Bölümler"
            icon="layers"
            hint={faculty ? faculty.name : 'Önce bir fakülte seçin.'}
            actions={
              faculty ? (
                <Button
                  icon="layers"
                  sm
                  variant="subtle"
                  onClick={() => {
                    resetForm();
                    setOpenDepartment(true);
                  }}
                >
                  Bölüm Ekle
                </Button>
              ) : undefined
            }
          >
            {!faculty ? (
              <EmptyState icon="layers" title="Fakülte seçilmedi" sub="Soldaki listeden bir fakülteye tıklayın." />
            ) : faculty.departments.length === 0 ? (
              <EmptyState
                icon="layers"
                title="Bu fakültede bölüm yok"
                sub={`${faculty.name} altına ilk bölümü ekleyin.`}
              />
            ) : (
              faculty.departments.map((d) => (
                <PickRow
                  key={d.id}
                  active={d.id === departmentId}
                  icon="layers"
                  title={`${d.code} · ${d.name}`}
                  sub={`${d.programs.length} program`}
                  right={
                    <Badge tone="info">
                      {d.programs.reduce((s, p) => s + p.studentCount, 0)} öğrenci
                    </Badge>
                  }
                  onClick={() => setDepartmentId((cur) => (cur === d.id ? '' : d.id))}
                />
              ))
            )}
          </Card>

          {/* --- Programlar --- */}
          <Card
            title="Programlar"
            icon="book"
            hint={department ? department.name : 'Önce bir bölüm seçin.'}
            actions={
              department ? (
                <Button
                  icon="book"
                  sm
                  variant="subtle"
                  onClick={() => {
                    resetForm();
                    setOpenProgram(true);
                  }}
                >
                  Program Ekle
                </Button>
              ) : undefined
            }
          >
            {!department ? (
              <EmptyState icon="book" title="Bölüm seçilmedi" sub="Bölüm listesinden bir kayda tıklayın." />
            ) : department.programs.length === 0 ? (
              <EmptyState
                icon="book"
                title="Bu bölümde program yok"
                sub={`${department.name} altına ilk programı ekleyin.`}
              />
            ) : (
              department.programs.map((p) => (
                <PickRow
                  key={p.id}
                  active={curProgram?.id === p.id}
                  icon="award"
                  title={`${p.code} · ${p.name}`}
                  sub={
                    <>
                      {LEVEL_TR[p.level] ?? p.level}
                      {p.language ? ` · ${p.language.toUpperCase()}` : ''} · müfredat için tıklayın
                    </>
                  }
                  right={
                    <Badge tone={p.studentCount > 0 ? 'ok' : 'muted'}>{p.studentCount} öğrenci</Badge>
                  }
                  onClick={() => void openCurriculum(p)}
                />
              ))
            )}
          </Card>
        </div>
      )}

      {/* --- Fakülte ekle --- */}
      <Drawer
        open={openFaculty}
        onClose={() => setOpenFaculty(false)}
        title="Fakülte Ekle"
      >
        {formErr ? <Alert tone="err">{formErr}</Alert> : null}
        <div className="field">
          <label>Fakülte Kodu</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="örn. MUH" maxLength={32} />
          <div className="hint-sm">Kod üniversite içinde tekildir; aynı kod ikinci kez kullanılamaz.</div>
        </div>
        <div className="field">
          <label>Fakülte Adı</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="örn. Mühendislik Fakültesi"
            maxLength={200}
          />
        </div>
        <Button block icon="check" onClick={() => void createFaculty()} disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Fakülteyi Ekle'}
        </Button>
      </Drawer>

      {/* --- Bölüm ekle --- */}
      <Drawer open={openDepartment} onClose={() => setOpenDepartment(false)} title="Bölüm Ekle">
        <div className="info-box" style={{ marginTop: 0, marginBottom: 14 }}>
          Fakülte: <b>{faculty?.name ?? '—'}</b>
        </div>
        {formErr ? <Alert tone="err">{formErr}</Alert> : null}
        <div className="field">
          <label>Bölüm Kodu</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="örn. BLM" maxLength={32} />
        </div>
        <div className="field">
          <label>Bölüm Adı</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="örn. Bilgisayar Mühendisliği"
            maxLength={200}
          />
        </div>
        <Button block icon="check" onClick={() => void createDepartment()} disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Bölümü Ekle'}
        </Button>
      </Drawer>

      {/* --- Program ekle --- */}
      <Drawer open={openProgram} onClose={() => setOpenProgram(false)} title="Program Ekle">
        <div className="info-box" style={{ marginTop: 0, marginBottom: 14 }}>
          Bölüm: <b>{department?.name ?? '—'}</b>
          <div className="meta">{faculty?.name}</div>
        </div>
        {formErr ? <Alert tone="err">{formErr}</Alert> : null}
        <div className="field">
          <label>Program Kodu</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="örn. BLM-L" maxLength={32} />
        </div>
        <div className="field">
          <label>Program Adı</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="örn. Bilgisayar Mühendisliği (Lisans)"
            maxLength={200}
          />
        </div>
        <div className="field">
          <label>Öğrenim Düzeyi</label>
          <Segmented value={level} onChange={setLevel} options={LEVEL_OPTS} />
        </div>
        <Button block icon="check" onClick={() => void createProgram()} disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Programı Ekle'}
        </Button>
      </Drawer>

      {/* --- Müfredat versiyonları --- */}
      <Drawer
        open={curProgram != null}
        onClose={() => setCurProgram(null)}
        title="Müfredat Versiyonları"
      >
        {curProgram && (
          <>
            <div className="info-box" style={{ marginTop: 0, marginBottom: 14 }}>
              <b>
                {curProgram.code} · {curProgram.name}
              </b>
              <div className="meta">
                {LEVEL_TR[curProgram.level] ?? curProgram.level} · {curProgram.studentCount} öğrenci
              </div>
            </div>

            {curErr ? <Alert tone="err">{curErr}</Alert> : null}

            {loadingVersions ? (
              <Skeleton lines={3} />
            ) : versions.length === 0 ? (
              <EmptyState
                icon="fileText"
                title="Müfredat versiyonu yok"
                sub="Aşağıdan ilk versiyonu tanımlayın."
              />
            ) : (
              <div style={{ marginBottom: 16 }}>
                {versions.map((v) => (
                  <div className="list-item" key={v.id}>
                    <div>
                      <b>
                        {v.year} · {v.name}
                      </b>
                    </div>
                    <Badge tone={v.isActive ? 'ok' : 'muted'}>{v.isActive ? 'aktif' : 'pasif'}</Badge>
                  </div>
                ))}
              </div>
            )}

            <div className="field">
              <label>Yıl</label>
              <input
                type="number"
                min={1900}
                max={2200}
                value={curYear}
                onChange={(e) => setCurYear(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Versiyon Adı</label>
              <input
                value={curName}
                onChange={(e) => setCurName(e.target.value)}
                placeholder="örn. 2025 Müfredatı"
                maxLength={200}
              />
            </div>
            <div className="field">
              <label>Durum</label>
              <select
                value={curActive ? '1' : '0'}
                onChange={(e) => setCurActive(e.target.value === '1')}
                aria-label="Versiyon durumu"
              >
                <option value="1">Aktif</option>
                <option value="0">Pasif</option>
              </select>
            </div>
            <Button block icon="check" onClick={() => void createVersion()} disabled={savingCur}>
              {savingCur ? 'Kaydediliyor…' : 'Versiyon Ekle'}
            </Button>
          </>
        )}
      </Drawer>
    </>
  );
}
