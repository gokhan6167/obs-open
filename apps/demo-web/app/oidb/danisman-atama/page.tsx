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

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  advisorUserId?: string | null;
  advisorName?: string | null;
}
interface Advisor {
  id: string;
  fullName: string;
}

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

export default function DanismanAtama(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
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

  const withAdvisor = useMemo(
    () => rows.filter((r) => r.advisorUserId || r.advisorName).length,
    [rows],
  );

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

  async function assign(): Promise<void> {
    if (sel.size === 0 || !advisorUserId) return;
    const advName = advisors.find((a) => a.id === advisorUserId)?.fullName ?? '';
    setBusy(true);
    try {
      const studentIds = [...sel];
      await api('/students/advisor/bulk', {
        method: 'POST',
        body: { studentIds, advisorUserId },
      });
      toast('Danışman atandı', {
        tone: 'ok',
        body: `${studentIds.length} öğrenci → ${advName || 'danışman'}`,
      });
      // yerel yansıt (liste yenilenene kadar)
      setRows((rs) =>
        rs.map((r) => (sel.has(r.id) ? { ...r, advisorUserId, advisorName: advName } : r)),
      );
      setSel(new Set());
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Danışman atanamadı';
      toast('Danışman atanamadı', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Danışman Atama"
        sub="Öğrencileri seçin, bir danışman personel belirleyin ve toplu atama yapın. Mevcut danışman (varsa) listede gösterilir."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Öğrenci', value: rows.length, icon: 'users' },
            { label: 'Danışmanı olan', value: withAdvisor, icon: 'check', tone: 'ok' },
            { label: 'Seçili', value: sel.size, icon: 'checkCircle', tone: sel.size > 0 ? 'ok' : undefined },
          ]}
        />
      )}

      <Card title="Toplu Atama" icon="user">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Danışman</label>
          <select value={advisorUserId} onChange={(e) => setAdvisorUserId(e.target.value)} disabled={loading}>
            <option value="">Danışman seçin…</option>
            {advisors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>
        </div>
        <Button
          onClick={assign}
          disabled={busy || sel.size === 0 || !advisorUserId}
          block
        >
          {busy ? 'İşleniyor…' : `Seçili ${sel.size} öğrenciye ata`}
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
                key: 'advisorName',
                header: 'Mevcut Danışman',
                sortable: true,
                value: (r) => r.advisorName ?? '',
                render: (r) =>
                  r.advisorName ? r.advisorName : <span className="muted">—</span>,
              },
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
