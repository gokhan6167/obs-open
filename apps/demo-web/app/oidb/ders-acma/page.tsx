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
  ProgressBar,
  EmptyState,
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
interface CourseCatalog {
  id: string;
  code: string;
  nameTr: string;
  ects: number;
  localCredit: number;
}
interface ActiveTerm {
  id: string;
  year: number;
  term: string;
  name: string;
}

export default function DersAcma(): React.ReactElement {
  const [rows, setRows] = useState<SectionRow[]>([]);
  const [term, setTerm] = useState<ActiveTerm | null>(null);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Yeni şube açma paneli
  const [openNew, setOpenNew] = useState(false);
  const [catalog, setCatalog] = useState<CourseCatalog[]>([]);
  const [catErr, setCatErr] = useState('');
  const [courseId, setCourseId] = useState('');
  const [code, setCode] = useState('');
  const [quota, setQuota] = useState('40');
  const [saving, setSaving] = useState(false);

  // Kontenjan güncelleme paneli
  const [editRow, setEditRow] = useState<SectionRow | null>(null);
  const [editQuota, setEditQuota] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      api<{ items: SectionRow[] }>('/portal/sections'),
      api<ActiveTerm | null>('/calendar/active-term'),
    ]);
    setRows(s.items ?? []);
    setTerm(t);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  const openNewPanel = useCallback(async () => {
    setOpenNew(true);
    setCourseId('');
    setCode('');
    setQuota('40');
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

  const createSection = useCallback(async () => {
    if (!term) {
      toast('Aktif dönem yok', { tone: 'err', body: 'Şube açmak için aktif bir akademik dönem gerekir.' });
      return;
    }
    const q = Number(quota);
    if (!courseId || !code.trim() || !Number.isInteger(q) || q < 0) {
      toast('Eksik bilgi', { tone: 'err', body: 'Ders, şube kodu ve geçerli kontenjan zorunludur.' });
      return;
    }
    setSaving(true);
    try {
      await api('/enrollment/sections', {
        method: 'POST',
        body: { courseId, termId: term.id, code: code.trim(), quota: q },
      });
      toast('Şube açıldı', { tone: 'ok', body: `${code.trim()} şubesi ${q} kontenjanla oluşturuldu.` });
      setOpenNew(false);
      await load();
    } catch (e) {
      toast('Şube açılamadı', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setSaving(false);
    }
  }, [term, quota, courseId, code, load]);

  const openEdit = useCallback((r: SectionRow) => {
    setEditRow(r);
    setEditQuota(String(r.quota));
  }, []);

  const saveQuota = useCallback(async () => {
    if (!editRow) return;
    const q = Number(editQuota);
    if (!Number.isInteger(q) || q < 0) {
      toast('Geçersiz kontenjan', { tone: 'err' });
      return;
    }
    if (q < editRow.enrolled) {
      toast('Kontenjan düşük', {
        tone: 'err',
        body: `Kontenjan mevcut kayıtlı (${editRow.enrolled}) sayısının altına indirilemez.`,
      });
      return;
    }
    setEditSaving(true);
    try {
      await api(`/sections/${editRow.sectionId}/quota`, { method: 'PATCH', body: { quota: q } });
      toast('Kontenjan güncellendi', {
        tone: 'ok',
        body: `${editRow.courseCode} · ${editRow.sectionCode} → ${q}`,
      });
      setEditRow(null);
      await load();
    } catch (e) {
      toast('Güncellenemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setEditSaving(false);
    }
  }, [editRow, editQuota, load]);

  const stats = useMemo(() => {
    const totalQuota = rows.reduce((s, r) => s + r.quota, 0);
    const totalEnrolled = rows.reduce((s, r) => s + r.enrolled, 0);
    const openCount = rows.filter((r) => r.isOpen).length;
    const fullCount = rows.length - openCount;
    return { totalQuota, totalEnrolled, openCount, fullCount };
  }, [rows]);

  const selectedCourse = catalog.find((c) => c.id === courseId);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Ders Açma / Şube"
        sub="Aktif dönemin şubeleri, doluluk oranları ve kontenjan yönetimi."
        actions={
          <Button icon="grade" onClick={openNewPanel}>
            Yeni Şube Aç
          </Button>
        }
      />

      {!loaded ? (
        <Skeleton lines={6} />
      ) : (
        <>
          {!term && (
            <Alert tone="warn">
              Aktif akademik dönem bulunmuyor. Yeni şube açmak için önce bir dönem aktifleştirilmelidir.
            </Alert>
          )}

          <StatGrid
            stats={[
              { label: 'Toplam şube', value: rows.length, icon: 'grade' },
              { label: 'Açık şube', value: stats.openCount, icon: 'checkCircle', tone: 'ok' },
              {
                label: 'Dolu şube',
                value: stats.fullCount,
                icon: 'alert',
                tone: stats.fullCount > 0 ? 'warn' : undefined,
              },
              {
                label: 'Doluluk',
                value: `${stats.totalEnrolled} / ${stats.totalQuota}`,
                icon: 'users',
              },
            ]}
          />

          <Card
            title={term ? `${term.name} · Şubeler` : 'Şubeler'}
            icon="grade"
            hint="Bir şubenin kontenjanını güncellemek için satırdaki düğmeyi kullanın."
          >
            <DataTable
              rows={rows}
              csv
              csvName="subeler"
              empty="Aktif dönemde açılmış şube yok."
              columns={[
                {
                  key: 'course',
                  header: 'Ders',
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
                  value: (r) => r.sectionCode,
                  render: (r) => <Badge tone="muted">{r.sectionCode}</Badge>,
                },
                {
                  key: 'instructorName',
                  header: 'Öğretim Elemanı',
                  value: (r) => r.instructorName ?? '',
                  render: (r) =>
                    r.instructorName ? (
                      r.instructorName
                    ) : (
                      <span className="muted">atanmadı</span>
                    ),
                },
                {
                  key: 'fillRate',
                  header: 'Doluluk',
                  num: true,
                  value: (r) => r.fillRate,
                  render: (r) => (
                    <div style={{ minWidth: 150 }}>
                      <div
                        className="row"
                        style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}
                      >
                        <span>
                          {r.enrolled} / {r.quota}
                        </span>
                        <span className="muted">%{r.fillRate}</span>
                      </div>
                      <ProgressBar value={r.fillRate} />
                    </div>
                  ),
                },
                {
                  key: 'isOpen',
                  header: 'Durum',
                  value: (r) => (r.isOpen ? 'açık' : 'dolu'),
                  render: (r) => (
                    <Badge tone={r.isOpen ? 'ok' : 'warn'}>{r.isOpen ? 'açık' : 'dolu'}</Badge>
                  ),
                },
                {
                  key: 'action',
                  header: '',
                  sortable: false,
                  render: (r) => (
                    <Button variant="subtle" sm icon="edit" onClick={() => openEdit(r)}>
                      Kontenjan
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}

      {/* Yeni şube açma */}
      <Drawer open={openNew} onClose={() => setOpenNew(false)} title="Yeni Şube Aç">
        {catErr ? (
          <Alert tone="err">{catErr}</Alert>
        ) : catalog.length === 0 ? (
          <Skeleton lines={4} />
        ) : (
          <>
            {term ? (
              <div className="info-box" style={{ marginTop: 0 }}>
                Aktif dönem: <b>{term.name}</b>
              </div>
            ) : (
              <Alert tone="warn">Aktif dönem yok — şube açılamaz.</Alert>
            )}
            <div className="field">
              <label>Ders</label>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Ders">
                <option value="">— ders seçin —</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.nameTr} ({c.ects} AKTS)
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Şube Kodu</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="örn. 01"
                maxLength={20}
              />
            </div>
            <div className="field">
              <label>Kontenjan</label>
              <input
                type="number"
                min={0}
                max={1000}
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
              />
            </div>
            {selectedCourse && (
              <div className="info-box">
                <b>{selectedCourse.code}</b> · {selectedCourse.nameTr} · {selectedCourse.ects} AKTS ·{' '}
                {selectedCourse.localCredit} kredi
              </div>
            )}
            <Button
              block
              icon="check"
              onClick={createSection}
              disabled={saving || !term}
            >
              {saving ? 'Açılıyor…' : 'Şubeyi Aç'}
            </Button>
          </>
        )}
      </Drawer>

      {/* Kontenjan güncelleme */}
      <Drawer open={editRow != null} onClose={() => setEditRow(null)} title="Kontenjan Güncelle">
        {editRow && (
          <>
            <StatGrid
              stats={[
                { label: 'Ders', value: editRow.courseCode, icon: 'book' },
                { label: 'Şube', value: editRow.sectionCode, icon: 'grade' },
                { label: 'Kayıtlı', value: editRow.enrolled, icon: 'users' },
              ]}
            />
            <div className="field">
              <label>Yeni Kontenjan</label>
              <input
                type="number"
                min={editRow.enrolled}
                max={1000}
                value={editQuota}
                onChange={(e) => setEditQuota(e.target.value)}
              />
              <div className="hint-sm">
                Kayıtlı öğrenci sayısının ({editRow.enrolled}) altına indirilemez.
              </div>
            </div>
            <Button block icon="check" onClick={saveQuota} disabled={editSaving}>
              {editSaving ? 'Kaydediliyor…' : 'Kontenjanı Güncelle'}
            </Button>
          </>
        )}
      </Drawer>

      {loaded && rows.length === 0 && !term && (
        <EmptyState
          icon="grade"
          title="Şube bulunmuyor"
          sub="Aktif bir dönem yok veya bu dönemde henüz şube açılmadı."
        />
      )}
    </>
  );
}
