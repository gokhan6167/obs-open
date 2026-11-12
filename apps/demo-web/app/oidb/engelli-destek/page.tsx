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
  EmptyState,
  toast,
} from '@/app/ui';

interface DisabilityRow {
  id: string;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  disabilityType?: string | null;
  needs?: string | null;
  accommodations?: string | null;
  examExtraTimePct?: number | null;
  status: string;
  createdAt: string;
}
interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
}

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  pasif: 'Pasif',
  kapali: 'Kapalı',
};
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  aktif: 'ok',
  pasif: 'muted',
  kapali: 'danger',
};

function isForbidden(msg: string): boolean {
  return /yetki|forbidden|403/i.test(msg);
}

export default function EngelliDestek(): React.ReactElement {
  const [rows, setRows] = useState<DisabilityRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState('');
  const [denied, setDenied] = useState(false);

  // yeni kayıt formu
  const [studentId, setStudentId] = useState('');
  const [disabilityType, setDisabilityType] = useState('');
  const [needs, setNeeds] = useState('');
  const [accommodations, setAccommodations] = useState('');
  const [examExtraTimePct, setExamExtraTimePct] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [dis, stu] = await Promise.all([
      api<{ items: DisabilityRow[] }>('/wellbeing/disability'),
      api<{ items: StudentRow[] }>('/portal/students'),
    ]);
    setRows(dis.items);
    setStudents(stu.items);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => {
        const m = e instanceof Error ? e.message : 'Kayıtlar alınamadı';
        setDenied(isForbidden(m));
        setListErr(m);
      })
      .finally(() => setLoading(false));
  }, [load]);

  const nameByStudentId = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) map.set(s.id, s.fullName);
    return map;
  }, [students]);

  const activeCount = useMemo(() => rows.filter((r) => r.status === 'aktif').length, [rows]);
  const extraTimeCount = useMemo(
    () => rows.filter((r) => (r.examExtraTimePct ?? 0) > 0).length,
    [rows],
  );
  const avgExtraTime = useMemo(() => {
    const list = rows.filter((r) => (r.examExtraTimePct ?? 0) > 0);
    if (list.length === 0) return 0;
    return Math.round(list.reduce((a, r) => a + (r.examExtraTimePct ?? 0), 0) / list.length);
  }, [rows]);

  const pctValue = parseInt(examExtraTimePct, 10);
  const pctValid =
    examExtraTimePct.trim() === '' ||
    (Number.isInteger(pctValue) && pctValue >= 0 && pctValue <= 100);
  const canSubmit = !!studentId && !!disabilityType.trim() && pctValid && !creating;

  async function create(): Promise<void> {
    if (!canSubmit) return;
    setCreating(true);
    try {
      await api('/wellbeing/disability', {
        method: 'POST',
        body: {
          studentId,
          disabilityType: disabilityType.trim(),
          needs: needs.trim() || undefined,
          accommodations: accommodations.trim() || undefined,
          examExtraTimePct: examExtraTimePct.trim() === '' ? undefined : pctValue,
        },
      });
      toast('Kayıt oluşturuldu', {
        tone: 'ok',
        body: `${nameByStudentId.get(studentId) ?? 'Öğrenci'} · ${disabilityType.trim()}`,
      });
      setStudentId('');
      setDisabilityType('');
      setNeeds('');
      setAccommodations('');
      setExamExtraTimePct('');
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt oluşturulamadı';
      toast('Kayıt oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Engelli Öğrenci Desteği"
        sub="Engel durumu bildirilen öğrencilerin ihtiyaç, makul düzenleme ve sınav ek süre tanımlarını yönetin."
      />

      {denied ? (
        <Alert tone="err">
          Bu ekrana erişim yetkiniz bulunmuyor. Engelli destek kayıtları yalnızca yetkili
          birim personeli tarafından görüntülenebilir. Erişim için sistem yöneticinize başvurun.
        </Alert>
      ) : (
        <>
          <Alert tone="info">
            Tanımlanan <strong>sınav ek süresi</strong> sınav planlamasında dikkate alınır; ilgili
            öğrenciye salon ve süre ataması bu oran üzerinden yapılır.
          </Alert>

          {loading ? (
            <SkeletonStats n={4} />
          ) : (
            <StatGrid
              stats={[
                { label: 'Kayıt', value: rows.length, icon: 'users' },
                { label: 'Aktif', value: activeCount, icon: 'check', tone: 'ok' },
                { label: 'Ek Süreli', value: extraTimeCount, icon: 'clock' },
                { label: 'Ort. Ek Süre', value: `%${avgExtraTime}`, icon: 'activity' },
              ]}
            />
          )}

          <Card title="Yeni Destek Kaydı" icon="shield">
            <div className="field">
              <label>Öğrenci</label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                disabled={loading || creating}
              >
                <option value="">Öğrenci seçin…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.studentNo} · {s.fullName} — {s.programName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Engel Türü</label>
              <input
                value={disabilityType}
                onChange={(e) => setDisabilityType(e.target.value)}
                placeholder="Örn. Görme engeli"
                disabled={loading || creating}
              />
            </div>
            <div className="field">
              <label>İhtiyaçlar</label>
              <textarea
                value={needs}
                onChange={(e) => setNeeds(e.target.value)}
                placeholder="Öğrencinin bildirdiği ihtiyaçlar"
                rows={3}
                disabled={loading || creating}
              />
            </div>
            <div className="field">
              <label>Düzenlemeler</label>
              <textarea
                value={accommodations}
                onChange={(e) => setAccommodations(e.target.value)}
                placeholder="Sağlanacak makul düzenlemeler (okuyucu, ayrı salon, büyük punto…)"
                rows={3}
                disabled={loading || creating}
              />
            </div>
            <div className="field">
              <label>Sınav Ek Süresi (%)</label>
              <input
                value={examExtraTimePct}
                onChange={(e) => setExamExtraTimePct(e.target.value)}
                inputMode="numeric"
                placeholder="0–100"
                disabled={loading || creating}
              />
              {!pctValid && <p className="hint">0 ile 100 arasında tam sayı girin.</p>}
            </div>
            <Button onClick={create} disabled={!canSubmit} block icon="check">
              {creating ? 'Kaydediliyor…' : 'Kaydı Oluştur'}
            </Button>
          </Card>

          <Card title="Destek Kayıtları" icon="users">
            {listErr && <Alert tone="err">{listErr}</Alert>}
            {loading ? (
              <Skeleton lines={8} />
            ) : (
              <DataTable<DisabilityRow>
                rows={rows}
                search
                csv
                csvName="engelli-destek"
                empty={
                  <EmptyState
                    icon="users"
                    title="Kayıt yok"
                    sub="Yukarıdaki formdan ilk destek kaydını oluşturun."
                  />
                }
                columns={[
                  {
                    key: 'student',
                    header: 'Öğrenci',
                    sortable: true,
                    value: (r) =>
                      `${r.studentNo} ${nameByStudentId.get(r.studentId) ?? r.studentEmail}`,
                    render: (r) => (
                      <div>
                        <strong>{nameByStudentId.get(r.studentId) ?? r.studentEmail}</strong>
                        <div className="meta">{r.studentNo}</div>
                      </div>
                    ),
                  },
                  {
                    key: 'disabilityType',
                    header: 'Engel Türü',
                    sortable: true,
                    value: (r) => r.disabilityType ?? '',
                    render: (r) =>
                      r.disabilityType ? r.disabilityType : <span className="muted">—</span>,
                  },
                  {
                    key: 'needs',
                    header: 'İhtiyaçlar',
                    value: (r) => r.needs ?? '',
                    render: (r) => (r.needs ? r.needs : <span className="muted">—</span>),
                  },
                  {
                    key: 'accommodations',
                    header: 'Düzenlemeler',
                    value: (r) => r.accommodations ?? '',
                    render: (r) =>
                      r.accommodations ? r.accommodations : <span className="muted">—</span>,
                  },
                  {
                    key: 'examExtraTimePct',
                    header: 'Sınav Ek Süre',
                    sortable: true,
                    num: true,
                    value: (r) => r.examExtraTimePct ?? 0,
                    render: (r) =>
                      (r.examExtraTimePct ?? 0) > 0 ? (
                        <Badge tone="info">%{r.examExtraTimePct}</Badge>
                      ) : (
                        <span className="muted">—</span>
                      ),
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    sortable: true,
                    value: (r) => STATUS_TR[r.status] ?? r.status,
                    render: (r) => (
                      <Badge tone={STATUS_TONE[r.status] ?? 'muted'}>
                        {STATUS_TR[r.status] ?? r.status}
                      </Badge>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
