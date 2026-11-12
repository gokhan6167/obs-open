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
  Drawer,
  Alert,
  Skeleton,
  SkeletonStats,
  EmptyState,
  toast,
} from '@/app/ui';

type PoolKind = 'secmeli' | 'ortak' | 'alan';
type PoolStatus = 'aktif' | 'pasif' | 'kapali';

interface ElectivePool {
  id: string;
  code: string;
  name: string;
  kind: PoolKind;
  status: PoolStatus;
  courseCount: number;
}

interface PoolCourse {
  id: string;
  code: string;
  nameTr: string;
  ects: number;
  localCredit: number;
}

interface CourseCatalog {
  id: string;
  code: string;
  nameTr: string;
  ects: number;
  localCredit: number;
}

const KIND_TR: Record<string, string> = {
  secmeli: 'Seçmeli',
  ortak: 'Ortak',
  alan: 'Alan',
};

const STATUS_TR: Record<PoolStatus, string> = {
  aktif: 'Aktif',
  pasif: 'Pasif',
  kapali: 'Kapalı',
};

const statusTone = (s: PoolStatus): 'ok' | 'muted' | 'danger' =>
  s === 'aktif' ? 'ok' : s === 'kapali' ? 'danger' : 'muted';

export default function SecmeliHavuz(): React.ReactElement {
  const [rows, setRows] = useState<ElectivePool[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Yeni havuz paneli
  const [openNew, setOpenNew] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PoolKind>('secmeli');
  const [saving, setSaving] = useState(false);

  // Havuz detay + ders ekleme paneli
  const [detail, setDetail] = useState<ElectivePool | null>(null);
  const [courses, setCourses] = useState<PoolCourse[] | null>(null);
  const [coursesErr, setCoursesErr] = useState('');
  const [picker, setPicker] = useState<CourseCatalog[] | null>(null);
  const [pickerQ, setPickerQ] = useState('');
  const [adding, setAdding] = useState('');

  const load = useCallback(async () => {
    setRows(await apiList<ElectivePool>('/elective-pools'));
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const openNewPanel = useCallback(() => {
    setCode('');
    setName('');
    setKind('secmeli');
    setOpenNew(true);
  }, []);

  const createPool = useCallback(async () => {
    if (!code.trim() || !name.trim()) {
      toast('Eksik bilgi', { tone: 'err', body: 'Kod ve ad zorunludur.' });
      return;
    }
    setSaving(true);
    try {
      await api('/elective-pools', {
        method: 'POST',
        body: { code: code.trim(), name: name.trim(), kind },
      });
      toast('Havuz oluşturuldu', { tone: 'ok', body: `${code.trim()} · ${name.trim()}` });
      setOpenNew(false);
      await load();
    } catch (e) {
      toast('Oluşturulamadı', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setSaving(false);
    }
  }, [code, name, kind, load]);

  const changeStatus = useCallback(
    async (p: ElectivePool, status: PoolStatus) => {
      try {
        await api(`/elective-pools/${p.id}`, { method: 'PATCH', body: { status } });
        toast('Durum güncellendi', { tone: 'ok', body: `${p.code} · ${STATUS_TR[status]}` });
        await load();
      } catch (e) {
        toast('Güncellenemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
      }
    },
    [load],
  );

  const openDetail = useCallback(async (p: ElectivePool) => {
    setDetail(p);
    setCourses(null);
    setCoursesErr('');
    setPicker(null);
    setPickerQ('');
    try {
      setCourses(await api<PoolCourse[]>(`/elective-pools/${p.id}/courses`));
    } catch (e) {
      setCoursesErr(e instanceof Error ? e.message : 'Havuz dersleri alınamadı');
    }
  }, []);

  const loadPicker = useCallback(async () => {
    if (picker) return;
    try {
      setPicker(await api<CourseCatalog[]>('/courses'));
    } catch (e) {
      toast('Ders listesi alınamadı', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    }
  }, [picker]);

  const addCourse = useCallback(
    async (c: CourseCatalog) => {
      if (!detail) return;
      setAdding(c.id);
      try {
        await api(`/elective-pools/${detail.id}/courses`, {
          method: 'POST',
          body: { courseId: c.id },
        });
        toast('Ders eklendi', { tone: 'ok', body: `${c.code} · ${c.nameTr}` });
        setCourses(await api<PoolCourse[]>(`/elective-pools/${detail.id}/courses`));
        await load();
      } catch (e) {
        toast('Eklenemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
      } finally {
        setAdding('');
      }
    },
    [detail, load],
  );

  const stats = useMemo(() => {
    const active = rows.filter((p) => p.status === 'aktif').length;
    const closed = rows.filter((p) => p.status === 'kapali').length;
    const totalCourses = rows.reduce((n, p) => n + (p.courseCount ?? 0), 0);
    return { total: rows.length, active, closed, totalCourses };
  }, [rows]);

  const pickerRows = useMemo(() => {
    if (!picker) return [];
    const existing = new Set((courses ?? []).map((c) => c.id));
    const avail = picker.filter((c) => !existing.has(c.id));
    const s = pickerQ.trim().toLowerCase();
    return s
      ? avail.filter((c) => c.code.toLowerCase().includes(s) || c.nameTr.toLowerCase().includes(s))
      : avail;
  }, [picker, courses, pickerQ]);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Seçmeli Ders Havuzu"
        sub="Seçmeli, ortak ve alan havuzları; havuz durumu ve içindeki dersler."
        actions={
          <Button icon="layers" onClick={openNewPanel}>
            Yeni Havuz
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam havuz', value: stats.total, icon: 'layers' },
            { label: 'Aktif', value: stats.active, icon: 'checkCircle', tone: stats.active > 0 ? 'ok' : undefined },
            { label: 'Kapalı', value: stats.closed, icon: 'x', tone: stats.closed > 0 ? 'danger' : undefined },
            { label: 'Toplam ders', value: stats.totalCourses, icon: 'book' },
          ]}
        />
      )}

      <Card title="Havuzlar" icon="layers" hint="Dersleri yönetmek için satırdaki düğmeyi kullanın.">
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<ElectivePool>
            rows={rows}
            search
            csv
            csvName="oidb-secmeli-havuz"
            empty={
              <EmptyState
                icon="layers"
                title="Henüz havuz yok"
                sub="Sağ üstteki düğmeyle yeni bir seçmeli ders havuzu oluşturabilirsiniz."
              />
            }
            columns={[
              {
                key: 'code',
                header: 'Kod',
                sortable: true,
                value: (p) => p.code,
                render: (p) => <b>{p.code}</b>,
              },
              {
                key: 'name',
                header: 'Ad',
                sortable: true,
                value: (p) => p.name,
                render: (p) => (
                  <div>
                    <span>{p.name}</span>
                    <div className="meta">{KIND_TR[p.kind] ?? p.kind}</div>
                  </div>
                ),
              },
              {
                key: 'courseCount',
                header: 'Ders sayısı',
                sortable: true,
                num: true,
                value: (p) => p.courseCount ?? 0,
                render: (p) => p.courseCount ?? 0,
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (p) => STATUS_TR[p.status] ?? p.status,
                render: (p) => <Badge tone={statusTone(p.status)}>{STATUS_TR[p.status] ?? p.status}</Badge>,
              },
              {
                key: 'action',
                header: '',
                sortable: false,
                render: (p) => (
                  <Button variant="subtle" sm icon="book" onClick={() => openDetail(p)}>
                    Dersler
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Yeni havuz */}
      <Drawer open={openNew} onClose={() => setOpenNew(false)} title="Yeni Havuz">
        <div className="field">
          <label>Kod</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="örn. SEC-2025"
            maxLength={40}
          />
        </div>
        <div className="field">
          <label>Ad</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="örn. Bahar Dönemi Seçmeli Havuzu"
            maxLength={200}
          />
        </div>
        <div className="field">
          <label>Tür</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as PoolKind)} aria-label="Tür">
            <option value="secmeli">Seçmeli</option>
            <option value="ortak">Ortak</option>
            <option value="alan">Alan</option>
          </select>
        </div>
        <Button block icon="check" onClick={createPool} disabled={saving}>
          {saving ? 'Oluşturuluyor…' : 'Havuzu Oluştur'}
        </Button>
      </Drawer>

      {/* Havuz dersleri + ders ekleme */}
      <Drawer
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail ? `Dersler · ${detail.code}` : undefined}
      >
        {detail && (
          <>
            <p className="hint">
              {detail.name} · {KIND_TR[detail.kind] ?? detail.kind} · {STATUS_TR[detail.status]}
            </p>

            <Card title="Durum" icon="settings">
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Button
                  variant={detail.status === 'aktif' ? 'ok' : 'subtle'}
                  sm
                  onClick={() => changeStatus(detail, 'aktif')}
                  disabled={detail.status === 'aktif'}
                >
                  Aktif
                </Button>
                <Button
                  variant={detail.status === 'pasif' ? 'primary' : 'subtle'}
                  sm
                  onClick={() => changeStatus(detail, 'pasif')}
                  disabled={detail.status === 'pasif'}
                >
                  Pasif
                </Button>
                <Button
                  variant={detail.status === 'kapali' ? 'danger' : 'subtle'}
                  sm
                  onClick={() => changeStatus(detail, 'kapali')}
                  disabled={detail.status === 'kapali'}
                >
                  Kapalı
                </Button>
              </div>
            </Card>

            <Card
              title="Havuzdaki dersler"
              icon="book"
              actions={
                <Button variant="subtle" sm icon="upload" onClick={loadPicker}>
                  Ders Ekle
                </Button>
              }
            >
              {coursesErr ? (
                <Alert tone="err">{coursesErr}</Alert>
              ) : !courses ? (
                <Skeleton lines={4} />
              ) : courses.length === 0 ? (
                <EmptyState
                  icon="book"
                  title="Ders yok"
                  sub="Bu havuza henüz ders eklenmemiş. Yukarıdaki düğmeyle ekleyebilirsiniz."
                />
              ) : (
                <div className="col" style={{ gap: 8 }}>
                  {courses.map((c) => (
                    <div
                      key={c.id}
                      className="row"
                      style={{ justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}
                    >
                      <span>
                        <b>{c.code}</b> · {c.nameTr}
                      </span>
                      <Badge tone="muted">{c.ects} AKTS</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {picker != null && (
              <Card title="Ders seç" icon="search" hint="Havuza eklemek için bir ders seçin.">
                <div className="field">
                  <input
                    value={pickerQ}
                    onChange={(e) => setPickerQ(e.target.value)}
                    placeholder="Kod veya ad ile ara…"
                    aria-label="Ders ara"
                  />
                </div>
                {pickerRows.length === 0 ? (
                  <EmptyState icon="search" title="Uygun ders yok" sub="Eklenebilecek ders bulunamadı." />
                ) : (
                  <div className="col" style={{ gap: 8 }}>
                    {pickerRows.slice(0, 40).map((c) => (
                      <div
                        key={c.id}
                        className="row"
                        style={{ justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}
                      >
                        <span>
                          <b>{c.code}</b> · {c.nameTr}
                        </span>
                        <Button
                          variant="subtle"
                          sm
                          icon="check"
                          onClick={() => addCourse(c)}
                          disabled={adding === c.id}
                        >
                          {adding === c.id ? 'Ekleniyor…' : 'Ekle'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
