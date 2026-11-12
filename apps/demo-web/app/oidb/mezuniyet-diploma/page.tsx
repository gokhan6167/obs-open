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
  toast,
  fmtDate,
} from '@/app/ui';

type Degree = 'onlisans' | 'lisans' | 'yl' | 'doktora';
type DiplomaStatus = 'hazirlaniyor' | 'hazir' | 'teslim';

interface DiplomaRow {
  id: string;
  studentNo: string;
  fullName: string;
  diplomaNo: string | null;
  serialNo?: string | null;
  rankNo?: string | null;
  graduationDate: string | null;
  degree: Degree;
  status: DiplomaStatus;
}
interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | null;
}

const DEGREE_TR: Record<Degree, string> = {
  onlisans: 'Ön Lisans',
  lisans: 'Lisans',
  yl: 'Yüksek Lisans',
  doktora: 'Doktora',
};
const STATUS_TR: Record<DiplomaStatus, string> = {
  hazirlaniyor: 'Hazırlanıyor',
  hazir: 'Hazır',
  teslim: 'Teslim',
};
const STATUS_TONE: Record<DiplomaStatus, 'ok' | 'warn' | 'muted'> = {
  hazirlaniyor: 'warn',
  hazir: 'ok',
  teslim: 'muted',
};

const DEGREE_OPTS: Degree[] = ['onlisans', 'lisans', 'yl', 'doktora'];
const STATUS_OPTS: DiplomaStatus[] = ['hazirlaniyor', 'hazir', 'teslim'];

export default function MezuniyetDiploma(): React.ReactElement {
  const [rows, setRows] = useState<DiplomaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState('');

  // Mezun et akışı
  const [gradOpen, setGradOpen] = useState(false);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [stLoading, setStLoading] = useState(false);
  const [stErr, setStErr] = useState('');
  const [q, setQ] = useState('');
  const [pickedStudent, setPickedStudent] = useState<StudentRow | null>(null);
  const [gradForm, setGradForm] = useState({
    graduationDate: '',
    degree: 'lisans' as Degree,
    decisionNo: '',
    decisionDate: '',
  });
  const [gradBusy, setGradBusy] = useState(false);

  // Diploma düzenle akışı
  const [edit, setEdit] = useState<DiplomaRow | null>(null);
  const [editForm, setEditForm] = useState({
    diplomaNo: '',
    serialNo: '',
    rankNo: '',
    status: 'hazirlaniyor' as DiplomaStatus,
  });
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ items: DiplomaRow[] } | DiplomaRow[]>('/diploma');
    setRows(Array.isArray(res) ? res : res.items);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setListErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const dist = useMemo(() => {
    const teslim = rows.filter((r) => r.status === 'teslim').length;
    const hazir = rows.filter((r) => r.status === 'hazir').length;
    const hazirlaniyor = rows.filter((r) => r.status === 'hazirlaniyor').length;
    return { total: rows.length, teslim, hazir, hazirlaniyor };
  }, [rows]);

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

  function openGrad(): void {
    setGradOpen(true);
    setPickedStudent(null);
    setQ('');
    setStErr('');
    setGradForm({ graduationDate: '', degree: 'lisans', decisionNo: '', decisionDate: '' });
    void searchStudents('');
  }

  async function graduate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!pickedStudent) return;
    setGradBusy(true);
    try {
      await api('/diploma/graduate', {
        method: 'POST',
        body: {
          studentId: pickedStudent.id,
          graduationDate: gradForm.graduationDate,
          degree: gradForm.degree,
          decisionNo: gradForm.decisionNo,
          decisionDate: gradForm.decisionDate,
        },
      });
      toast('Öğrenci mezun edildi', {
        tone: 'ok',
        body: `${pickedStudent.studentNo} · ${DEGREE_TR[gradForm.degree]}`,
      });
      setGradOpen(false);
      await load();
    } catch (er) {
      const m = er instanceof Error ? er.message : 'Mezun etme başarısız';
      toast('Mezun etme başarısız', { tone: 'err', body: m });
    } finally {
      setGradBusy(false);
    }
  }

  function openEdit(r: DiplomaRow): void {
    setEdit(r);
    setEditForm({
      diplomaNo: r.diplomaNo ?? '',
      serialNo: r.serialNo ?? '',
      rankNo: r.rankNo ?? '',
      status: r.status,
    });
  }

  async function saveEdit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!edit) return;
    setEditBusy(true);
    try {
      await api(`/diploma/${edit.id}`, {
        method: 'PATCH',
        body: {
          diplomaNo: editForm.diplomaNo,
          serialNo: editForm.serialNo,
          rankNo: editForm.rankNo,
          status: editForm.status,
        },
      });
      toast('Diploma güncellendi', {
        tone: 'ok',
        body: `${edit.studentNo} · ${STATUS_TR[editForm.status]}`,
      });
      setEdit(null);
      await load();
    } catch (er) {
      const m = er instanceof Error ? er.message : 'Güncelleme başarısız';
      toast('Güncelleme başarısız', { tone: 'err', body: m });
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Mezuniyet & Diploma"
        sub="Diploma defterini görüntüleyin, öğrenci mezun edin ve diploma bilgilerini düzenleyin."
        actions={
          <Button variant="primary" icon="award" onClick={openGrad}>
            Mezun et
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Diploma kaydı', value: dist.total, icon: 'award' },
            { label: 'Hazırlanıyor', value: dist.hazirlaniyor, icon: 'clock', tone: dist.hazirlaniyor > 0 ? 'warn' : undefined },
            { label: 'Hazır', value: dist.hazir, icon: 'check', tone: 'ok' },
            { label: 'Teslim', value: dist.teslim, icon: 'checkCircle' },
          ]}
        />
      )}

      <Card title="Diploma Defteri" icon="award" hint="Diploma bilgilerini düzenlemek için satırdaki düğmeyi kullanın.">
        {listErr && <Alert tone="err">{listErr}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<DiplomaRow>
            rows={rows}
            search
            csv
            csvName="oidb-diploma-defteri"
            empty={<EmptyState icon="award" title="Diploma kaydı yok" sub="Öğrenci mezun ederek defter oluşturun." />}
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
                key: 'diplomaNo',
                header: 'Diploma No',
                sortable: true,
                value: (r) => r.diplomaNo ?? '',
                render: (r) => r.diplomaNo ?? <span className="muted">—</span>,
              },
              {
                key: 'degree',
                header: 'Derece',
                sortable: true,
                value: (r) => DEGREE_TR[r.degree] ?? r.degree,
              },
              {
                key: 'graduationDate',
                header: 'Mezuniyet',
                sortable: true,
                value: (r) => r.graduationDate ?? '',
                render: (r) => fmtDate(r.graduationDate),
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_TR[r.status] ?? r.status}</Badge>,
              },
              {
                key: '_action',
                header: '',
                render: (r) => (
                  <Button variant="ghost" sm icon="edit" onClick={() => openEdit(r)}>
                    Düzenle
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Mezun et */}
      <Drawer open={gradOpen} onClose={() => setGradOpen(false)} title="Öğrenci Mezun Et">
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
        ) : pickedStudent ? (
          <Alert tone="ok">
            Seçili: <b>{pickedStudent.studentNo}</b> · {pickedStudent.fullName} · {pickedStudent.programName}{' '}
            <Button variant="ghost" sm onClick={() => setPickedStudent(null)}>
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
                onClick={() => setPickedStudent(s)}
              >
                <span>
                  <b>{s.studentNo}</b> · {s.fullName}
                  <span className="meta">{s.programName}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {pickedStudent && (
          <form onSubmit={graduate} style={{ marginTop: 12 }}>
            <div className="field">
              <label>Mezuniyet tarihi</label>
              <input
                type="date"
                value={gradForm.graduationDate}
                onChange={(e) => setGradForm((f) => ({ ...f, graduationDate: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>Derece</label>
              <select
                value={gradForm.degree}
                onChange={(e) => setGradForm((f) => ({ ...f, degree: e.target.value as Degree }))}
              >
                {DEGREE_OPTS.map((d) => (
                  <option key={d} value={d}>
                    {DEGREE_TR[d]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Karar no</label>
              <input
                value={gradForm.decisionNo}
                onChange={(e) => setGradForm((f) => ({ ...f, decisionNo: e.target.value }))}
                placeholder="Yönetim kurulu karar no"
                required
              />
            </div>
            <div className="field">
              <label>Karar tarihi</label>
              <input
                type="date"
                value={gradForm.decisionDate}
                onChange={(e) => setGradForm((f) => ({ ...f, decisionDate: e.target.value }))}
                required
              />
            </div>
            <Button type="submit" variant="ok" icon="award" block disabled={gradBusy}>
              {gradBusy ? 'İşleniyor…' : 'Mezun et'}
            </Button>
          </form>
        )}
      </Drawer>

      {/* Diploma düzenle */}
      <Drawer
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit ? `Diploma · ${edit.studentNo}` : undefined}
      >
        {edit && (
          <form onSubmit={saveEdit}>
            <p className="hint">
              {edit.fullName} · {DEGREE_TR[edit.degree] ?? edit.degree} · Mezuniyet {fmtDate(edit.graduationDate)}
            </p>
            <div className="field">
              <label>Diploma no</label>
              <input
                value={editForm.diplomaNo}
                onChange={(e) => setEditForm((f) => ({ ...f, diplomaNo: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Seri no</label>
              <input
                value={editForm.serialNo}
                onChange={(e) => setEditForm((f) => ({ ...f, serialNo: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Sıra no</label>
              <input
                value={editForm.rankNo}
                onChange={(e) => setEditForm((f) => ({ ...f, rankNo: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Durum</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as DiplomaStatus }))}
              >
                {STATUS_OPTS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_TR[s]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="primary" icon="check" block disabled={editBusy}>
              {editBusy ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </form>
        )}
      </Drawer>
    </>
  );
}
