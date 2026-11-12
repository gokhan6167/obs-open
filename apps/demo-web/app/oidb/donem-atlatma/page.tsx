'use client';
import { useCallback, useEffect, useState } from 'react';
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
}
type Mode = 'class' | 'term';

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

const MODE_DESC: Record<Mode, string> = {
  class: 'Sınıf arttır: öğrencilerin sınıfını bir üst kademeye taşır (1 → 2).',
  term: 'Dönem arttır: aktif dönemi bir ileri alır (Güz → Bahar).',
};
const MODE_LABEL: Record<Mode, string> = {
  class: 'Sınıf arttır',
  term: 'Dönem arttır',
};

export default function DonemAtlatma(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('class');
  const [busy, setBusy] = useState(false);
  const [listErr, setListErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api<{ items: StudentRow[] }>('/portal/students');
    setRows(res.items);
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

  async function promote(): Promise<void> {
    if (sel.size === 0) return;
    const ok = window.confirm(
      `${sel.size} öğrenci için "${MODE_LABEL[mode]}" işlemi uygulanacak. Onaylıyor musunuz?`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const studentIds = [...sel];
      await api('/students/promote', {
        method: 'POST',
        body: { studentIds, mode },
      });
      toast('Toplu atlatma tamamlandı', {
        tone: 'ok',
        body: `${studentIds.length} öğrenci · ${MODE_LABEL[mode]}`,
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
        title="Dönem / Sınıf Atlatma"
        sub="Öğrencileri seçin, modu belirleyin ve toplu olarak bir üst sınıfa ya da bir sonraki döneme taşıyın."
      />

      {loading ? (
        <SkeletonStats n={2} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Öğrenci', value: rows.length, icon: 'users' },
            { label: 'Seçili', value: sel.size, icon: 'checkCircle', tone: sel.size > 0 ? 'ok' : undefined },
          ]}
        />
      )}

      <Card title="Toplu Atlatma" icon="arrowUp">
        <div className="field">
          <label>İşlem türü</label>
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            options={[
              { value: 'class', label: MODE_LABEL.class },
              { value: 'term', label: MODE_LABEL.term },
            ]}
          />
        </div>
        <Alert tone="info">{MODE_DESC[mode]}</Alert>
        <Button onClick={promote} disabled={busy || sel.size === 0} block>
          {busy ? 'İşleniyor…' : `Seçili ${sel.size} öğrenciyi ${MODE_LABEL[mode].toLowerCase()}`}
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
