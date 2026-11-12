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
  Segmented,
  toast,
} from '@/app/ui';

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa?: number | null;
  advisorName?: string | null;
}
interface Advisor {
  id: string;
  fullName: string;
}
type Op = 'class' | 'term' | 'advisor';

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  kayit_dondurma: 'Kayıt Donduruldu',
  pasif: 'Pasif',
  iliskigi_kesildi: 'İlişiği Kesildi',
  mezun: 'Mezun',
  azami_sure_doldu: 'Azami Süre Doldu',
  af_ogrencisi: 'Af Öğrencisi',
};
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  aktif: 'ok',
  mezun: 'ok',
  kayit_dondurma: 'warn',
  af_ogrencisi: 'warn',
  azami_sure_doldu: 'warn',
  pasif: 'muted',
  iliskigi_kesildi: 'danger',
};
function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'muted' {
  return STATUS_TONE[s] ?? 'muted';
}

const OP_LABEL: Record<Op, string> = {
  class: 'Sınıf arttır',
  term: 'Dönem arttır',
  advisor: 'Danışman ata',
};
const OP_DESC: Record<Op, string> = {
  class: 'Seçili öğrencilerin sınıfını bir üst kademeye taşır (1 → 2).',
  term: 'Seçili öğrencilerin aktif dönemini bir ileri alır (Güz → Bahar).',
  advisor: 'Seçili öğrencilere aşağıda belirlenen danışman personeli atar.',
};

export default function TopluIslemler(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [op, setOp] = useState<Op>('class');
  const [advisorUserId, setAdvisorUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [listErr, setListErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [st, adv] = await Promise.all([
      api<{ items: StudentRow[] }>('/portal/students'),
      api<{ items: Advisor[] } | Advisor[]>('/students/advisors'),
    ]);
    setRows(st.items);
    setAdvisors(Array.isArray(adv) ? adv : adv.items);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setListErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  function toggle(id: string): void {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll(ids: string[], on: boolean): void {
    setSel((s) => {
      const n = new Set(s);
      if (on) ids.forEach((i) => n.add(i));
      else ids.forEach((i) => n.delete(i));
      return n;
    });
  }
  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));

  const canRun = useMemo(() => {
    if (sel.size === 0) return false;
    if (op === 'advisor') return Boolean(advisorUserId);
    return true;
  }, [sel.size, op, advisorUserId]);

  async function run(): Promise<void> {
    if (!canRun) return;
    const studentIds = [...sel];

    if (op === 'advisor') {
      const advName = advisors.find((a) => a.id === advisorUserId)?.fullName ?? '';
      const ok = window.confirm(
        `${studentIds.length} öğrenciye "${advName || 'danışman'}" danışman olarak atanacak. Onaylıyor musunuz?`,
      );
      if (!ok) return;
      setBusy(true);
      try {
        await api('/students/advisor/bulk', {
          method: 'POST',
          body: { studentIds, advisorUserId },
        });
        toast('Danışman atandı', {
          tone: 'ok',
          body: `${studentIds.length} öğrenci → ${advName || 'danışman'}`,
        });
        setSel(new Set());
        await load();
      } catch (e) {
        const m = e instanceof Error ? e.message : 'Danışman atanamadı';
        toast('Danışman atanamadı', { tone: 'err', body: m });
      } finally {
        setBusy(false);
      }
      return;
    }

    const ok = window.confirm(
      `${studentIds.length} öğrenci için "${OP_LABEL[op]}" işlemi uygulanacak. Onaylıyor musunuz?`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api('/students/promote', {
        method: 'POST',
        body: { studentIds, mode: op },
      });
      toast('Toplu işlem tamamlandı', {
        tone: 'ok',
        body: `${studentIds.length} öğrenci · ${OP_LABEL[op]}`,
      });
      setSel(new Set());
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İşlem başarısız';
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Toplu İşlemler"
        sub="Öğrencileri seçin, uygulanacak işlemi belirleyin ve tek seferde toplu olarak yürütün."
      />

      {loading ? (
        <SkeletonStats n={2} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Öğrenci', value: rows.length, icon: 'users' },
            {
              label: 'Seçili',
              value: sel.size,
              icon: 'checkCircle',
              tone: sel.size > 0 ? 'ok' : undefined,
            },
          ]}
        />
      )}

      <Card title="İşlem" icon="bolt">
        <div className="field">
          <label>İşlem türü</label>
          <Segmented
            value={op}
            onChange={(v) => setOp(v as Op)}
            options={[
              { value: 'class', label: OP_LABEL.class },
              { value: 'term', label: OP_LABEL.term },
              { value: 'advisor', label: OP_LABEL.advisor },
            ]}
          />
        </div>
        <Alert tone="info">{OP_DESC[op]}</Alert>
        {op === 'advisor' && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Danışman</label>
            <select
              value={advisorUserId}
              onChange={(e) => setAdvisorUserId(e.target.value)}
              disabled={loading}
            >
              <option value="">Danışman seçin…</option>
              {advisors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button onClick={run} disabled={busy || !canRun} block>
          {busy
            ? 'İşleniyor…'
            : `Seçili ${sel.size} öğrenciye uygula · ${OP_LABEL[op]}`}
        </Button>
      </Card>

      <Card title="Öğrenci Listesi" icon="users">
        {listErr && <Alert tone="err">{listErr}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<StudentRow>
            rows={rows}
            search
            empty={<EmptyState icon="users" title="Öğrenci yok" sub="Arama terimini gevşetin." />}
            columns={[
              {
                key: '_sel',
                header: '',
                sortable: false,
                render: (r) => (
                  <input
                    type="checkbox"
                    checked={sel.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`${r.studentNo} seç`}
                  />
                ),
              },
              {
                key: 'studentNo',
                header: 'No',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => <b>{r.studentNo}</b>,
              },
              { key: 'fullName', header: 'Ad Soyad', sortable: true, value: (r) => r.fullName },
              { key: 'programName', header: 'Program', sortable: true, value: (r) => r.programName },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={statusTone(r.status)}>{STATUS_TR[r.status] ?? r.status}</Badge>
                ),
              },
            ]}
          />
        )}
        {!loading && rows.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Button
              variant="subtle"
              sm
              onClick={() => toggleAll(rows.map((r) => r.id), !allSelected)}
            >
              {allSelected ? 'Seçimi temizle' : 'Tümünü seç'}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
