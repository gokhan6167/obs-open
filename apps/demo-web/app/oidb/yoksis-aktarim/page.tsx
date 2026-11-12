'use client';
import { useEffect, useMemo, useState } from 'react';
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
  gpa: number | null;
}
interface ExportResult {
  exported: number;
  accepted: number;
}
type SendState = 'idle' | 'sending' | 'ok' | 'err';

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  kayit_dondurma: 'Kayıt donduruldu',
  pasif: 'Pasif',
  iliskigi_kesildi: 'İlişiği kesildi',
  mezun: 'Mezun',
  azami_sure_doldu: 'Azami süre doldu',
  af_ogrencisi: 'Af öğrencisi',
};

function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'muted' {
  if (s === 'aktif') return 'ok';
  if (s === 'mezun') return 'muted';
  if (s === 'iliskigi_kesildi' || s === 'azami_sure_doldu') return 'danger';
  return 'warn';
}

export default function YoksisAktarim(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Öğrenci başına son gönderim sonucu (mock simülasyon veya toplu export).
  const [sendState, setSendState] = useState<Record<string, SendState>>({});
  const [lastRun, setLastRun] = useState('');
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  useEffect(() => {
    api<{ items: StudentRow[] }>('/portal/students')
      .then((d) => setRows(d.items))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  const statusOptions = useMemo(
    () => [...new Set(rows.map((r) => r.status))].sort(),
    [rows],
  );

  const filtered = useMemo(
    () => rows.filter((r) => (status ? r.status === status : true)),
    [rows, status],
  );

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    setSelected((prev) => {
      const allShown = filtered.every((r) => prev.has(r.id));
      if (allShown) return new Set();
      return new Set(filtered.map((r) => r.id));
    });
  }

  // Mock: seçili öğrenciler için YÖKSİS gönderimi simülasyonu.
  // Gerçek entegrasyon bu ekranda adaptör ucuna bağlanacak; şimdilik
  // öğrenci numarasına göre deterministik bir kabul/ret üretilir.
  async function sendSelected(): Promise<void> {
    const ids = filtered.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (ids.length === 0) {
      toast('Öğrenci seçilmedi', { tone: 'info', body: 'Gönderim için en az bir öğrenci seçin.' });
      return;
    }
    setBusy(true);
    setErr('');
    setExportResult(null);
    setSendState((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = 'sending';
      });
      return next;
    });

    await new Promise((r) => setTimeout(r, 900));

    let ok = 0;
    let fail = 0;
    setSendState((prev) => {
      const next = { ...prev };
      for (const r of filtered) {
        if (!selected.has(r.id)) continue;
        // Pasif/ilişiği kesilmiş kayıtlar ret; diğerleri kabul (mock kural).
        const accepted = r.status === 'aktif' || r.status === 'mezun' || r.status === 'af_ogrencisi';
        next[r.id] = accepted ? 'ok' : 'err';
        if (accepted) ok += 1;
        else fail += 1;
      }
      return next;
    });

    setLastRun(new Date().toLocaleString('tr-TR'));
    setBusy(false);
    toast(fail > 0 ? 'Gönderim tamamlandı' : 'Gönderim başarılı', {
      tone: fail > 0 ? 'err' : 'ok',
      body:
        fail > 0
          ? `${ok} kabul, ${fail} reddedildi (uygun olmayan durum).`
          : `${ok} öğrenci YÖKSİS'e iletildi (mock).`,
    });
  }

  // Mevcut toplu uç: aktif dönem ders kayıtlarını YÖKSİS formatında bildirir.
  async function runBulkExport(): Promise<void> {
    if (
      !window.confirm(
        'Aktif dönem ders kayıtları YÖKSİS formatında dışa aktarılıp adaptöre bildirilecek. Devam edilsin mi?',
      )
    )
      return;
    setBusy(true);
    setErr('');
    try {
      const res = await api<ExportResult>('/reports/yoksis/export-enrollments', { method: 'POST' });
      setExportResult(res);
      setLastRun(new Date().toLocaleString('tr-TR'));
      const rejected = res.exported - res.accepted;
      toast(rejected > 0 ? 'Bildirim tamamlandı' : 'Bildirim başarılı', {
        tone: rejected > 0 ? 'err' : 'ok',
        body:
          rejected > 0
            ? `${res.accepted}/${res.exported} kabul, ${rejected} reddedildi.`
            : `${res.accepted} kayıt YÖKSİS'e iletildi.`,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Bildirim başarısız';
      setErr(m);
      toast('Bildirim başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const sentOk = useMemo(
    () => Object.values(sendState).filter((s) => s === 'ok').length,
    [sendState],
  );
  const sentErr = useMemo(
    () => Object.values(sendState).filter((s) => s === 'err').length,
    [sendState],
  );

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="YÖKSİS Veri Aktarımı"
        sub="Öğrenci kayıtlarını YÖKSİS'e bildirin. Bu ekran gerçek YÖKSİS entegrasyonunun arayüzü olup gönderim mock adaptör üzerinden simüle edilir."
        actions={
          <Button
            icon="upload"
            onClick={runBulkExport}
            disabled={busy}
          >
            Dönem kayıtlarını gönder
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam öğrenci', value: rows.length, icon: 'users' },
            { label: 'Seçili', value: selected.size, icon: 'checkCircle' },
            {
              label: 'Kabul edilen',
              value: sentOk,
              icon: 'check',
              tone: sentOk > 0 ? 'ok' : undefined,
            },
            {
              label: 'Reddedilen',
              value: sentErr,
              icon: 'alert',
              tone: sentErr > 0 ? 'danger' : undefined,
            },
          ]}
        />
      )}

      <Alert tone="info">
        Gerçek YÖKSİS servisi devreye alınana kadar &quot;YÖKSİS&apos;e gönder&quot; işlemi mock
        adaptörle çalışır. Aktif / mezun / af öğrencileri kabul edilir; pasif ve ilişiği kesilmiş
        kayıtlar reddedilir.
        {lastRun && (
          <>
            {' '}
            Son çalıştırma: <b>{lastRun}</b>.
          </>
        )}
        {exportResult && (
          <>
            {' '}
            Toplu bildirim: <b>{exportResult.accepted}</b>/<b>{exportResult.exported}</b> kabul.
          </>
        )}
      </Alert>

      <Card title="Filtre" icon="filter">
        <div className="field">
          <label>Durum</label>
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: '', label: 'Tümü' },
              ...statusOptions.map((s) => ({ value: s, label: STATUS_TR[s] ?? s })),
            ]}
          />
        </div>
      </Card>

      <Card
        title="Öğrenciler"
        icon="users"
        hint={`${selected.size} seçili`}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Button variant="subtle" sm icon="check" onClick={toggleAll} disabled={loading || busy}>
              {filtered.length > 0 && filtered.every((r) => selected.has(r.id))
                ? 'Seçimi kaldır'
                : 'Tümünü seç'}
            </Button>
            <Button
              variant="ok"
              sm
              icon="upload"
              onClick={sendSelected}
              disabled={busy || selected.size === 0}
            >
              YÖKSİS&apos;e gönder
            </Button>
          </div>
        }
      >
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<StudentRow>
            rows={filtered}
            search
            csv
            csvName="yoksis-aktarim"
            empty={
              <EmptyState
                icon="users"
                title="Öğrenci bulunamadı"
                sub="Durum filtresini gevşetin."
              />
            }
            columns={[
              {
                key: 'sel',
                header: '',
                render: (r) => (
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`${r.fullName} seç`}
                  />
                ),
              },
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => <b>{r.studentNo}</b>,
              },
              {
                key: 'fullName',
                header: 'Ad Soyad',
                sortable: true,
                value: (r) => r.fullName,
              },
              {
                key: 'programName',
                header: 'Program',
                sortable: true,
                value: (r) => r.programName,
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
              {
                key: 'result',
                header: 'Gönderim',
                value: (r) => sendState[r.id] ?? '',
                render: (r) => {
                  const st = sendState[r.id];
                  if (st === 'sending') return <Badge tone="info">Gönderiliyor…</Badge>;
                  if (st === 'ok') return <Badge tone="ok">Başarılı</Badge>;
                  if (st === 'err') return <Badge tone="danger">Hata</Badge>;
                  return <span className="muted">—</span>;
                },
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
