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
type Tab = 'yoksis' | 'asal';
type YoksisState = 'idle' | 'ok' | 'err';
type AsalState = 'iletildi' | 'onaylandi';

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

// MOCK: /portal/students cinsiyet bilgisi döndürmediğinden, ASAL askerlik
// listesi için erkek öğrenciler öğrenci numarasından deterministik olarak
// türetilir. Gerçek entegrasyonda cinsiyet MERNİS/öğrenci kaydından gelir.
function isMaleMock(studentNo: string): boolean {
  const n = Number(studentNo.replace(/\D/g, '').slice(-1));
  return Number.isFinite(n) && n % 2 === 0;
}

// MOCK: ASAL gönderim durumu. Aktif öğrenciler "Onaylandı", diğerleri "İletildi".
function asalStateMock(status: string): AsalState {
  return status === 'aktif' ? 'onaylandi' : 'iletildi';
}

export default function YoksisAsal(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>('yoksis');

  // YÖKSİS sekmesi
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [sendState, setSendState] = useState<Record<string, YoksisState>>({});
  const [lastRun, setLastRun] = useState('');
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  useEffect(() => {
    api<{ items: StudentRow[] }>('/portal/students')
      .then((d) => setRows(d.items))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  // ASAL: erkek + kaydı devam eden (pasif/ilişiği kesilmiş hariç) öğrenciler.
  const asalRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          isMaleMock(r.studentNo) &&
          r.status !== 'pasif' &&
          r.status !== 'iliskigi_kesildi' &&
          r.status !== 'mezun',
      ),
    [rows],
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
      const allShown = rows.length > 0 && rows.every((r) => prev.has(r.id));
      if (allShown) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }

  // Mevcut toplu uç: aktif dönem ders kayıtlarını YÖKSİS formatında bildirir.
  async function sendYoksis(): Promise<void> {
    if (
      !window.confirm(
        'Öğrenci kayıtları YÖKSİS formatında dışa aktarılıp adaptöre bildirilecek. Devam edilsin mi?',
      )
    )
      return;
    setBusy(true);
    setErr('');
    setExportResult(null);
    try {
      const res = await api<ExportResult>('/reports/yoksis/export-enrollments', { method: 'POST' });
      setExportResult(res);
      setLastRun(new Date().toLocaleString('tr-TR'));
      const rejected = res.exported - res.accepted;
      // Sonuç Badge'i için: seçili öğrenciler kabul/ret olarak işaretlenir (mock eşleme).
      setSendState(() => {
        const next: Record<string, YoksisState> = {};
        const ids = selected.size > 0 ? [...selected] : rows.map((r) => r.id);
        ids.forEach((id) => {
          const r = rows.find((x) => x.id === id);
          const accepted =
            r != null &&
            (r.status === 'aktif' || r.status === 'mezun' || r.status === 'af_ogrencisi');
          next[id] = accepted ? 'ok' : 'err';
        });
        return next;
      });
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

  const asalOnayli = useMemo(
    () => asalRows.filter((r) => asalStateMock(r.status) === 'onaylandi').length,
    [asalRows],
  );

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="YÖKSİS / ASAL Aktarımı"
        sub="Öğrenci verilerinin YÖKSİS'e bildirimi ve erkek öğrencilerin ASAL askerlik erteleme kayıtları. Bu ekran gerçek YÖKSİS/ASAL entegrasyonunun arayüzü olup gönderim mock adaptör üzerinden simüle edilir."
      />

      <div className="field">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'yoksis', label: 'YÖKSİS Veri' },
            { value: 'asal', label: 'ASAL Askerlik' },
          ]}
        />
      </div>

      {tab === 'yoksis' ? (
        <>
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
            Gerçek YÖKSİS servisi devreye alınana kadar &quot;YÖKSİS&apos;e Gönder&quot; işlemi mock
            adaptörle çalışır. Aktif / mezun / af öğrencileri kabul edilir; pasif ve ilişiği
            kesilmiş kayıtlar reddedilir.
            {lastRun && (
              <>
                {' '}
                Son çalıştırma: <b>{lastRun}</b>.
              </>
            )}
            {exportResult && (
              <>
                {' '}
                Bildirim: <b>{exportResult.accepted}</b>/<b>{exportResult.exported}</b> kabul.
              </>
            )}
          </Alert>

          <Card
            title="Öğrenciler"
            icon="users"
            hint={`${selected.size} seçili`}
            actions={
              <div className="row" style={{ gap: 8 }}>
                <Button
                  variant="subtle"
                  sm
                  icon="check"
                  onClick={toggleAll}
                  disabled={loading || busy}
                >
                  {rows.length > 0 && rows.every((r) => selected.has(r.id))
                    ? 'Seçimi kaldır'
                    : 'Tümünü seç'}
                </Button>
                <Button variant="ok" sm icon="upload" onClick={sendYoksis} disabled={busy}>
                  YÖKSİS&apos;e Gönder
                </Button>
              </div>
            }
          >
            {loading ? (
              <Skeleton lines={8} />
            ) : (
              <DataTable<StudentRow>
                rows={rows}
                search
                csv
                csvName="yoksis-veri"
                empty={
                  <EmptyState icon="users" title="Öğrenci bulunamadı" sub="Kayıtlı öğrenci yok." />
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
                      if (st === 'ok') return <Badge tone="ok">Başarılı</Badge>;
                      if (st === 'err') return <Badge tone="danger">Reddedildi</Badge>;
                      return <span className="muted">—</span>;
                    },
                  },
                ]}
              />
            )}
          </Card>
        </>
      ) : (
        <>
          {loading ? (
            <SkeletonStats n={3} />
          ) : (
            <StatGrid
              stats={[
                { label: 'Askerlik kaydı (erkek)', value: asalRows.length, icon: 'users' },
                { label: 'Onaylandı', value: asalOnayli, icon: 'check', tone: 'ok' },
                {
                  label: 'İletildi (beklemede)',
                  value: asalRows.length - asalOnayli,
                  icon: 'clock',
                  tone: asalRows.length - asalOnayli > 0 ? 'warn' : undefined,
                },
              ]}
            />
          )}

          <Alert tone="info">
            ASAL (Askeralma Genel Müdürlüğü) askerlik erteleme bildirimleri. Aşağıdaki erkek öğrenci
            listesi ve gönderim durumları <b>mock</b> verilerdir; gerçek entegrasyonda cinsiyet ve
            askerlik durumu MERNİS/ASAL servisinden alınır. &quot;Aktif&quot; öğrenciler onaylı,
            diğerleri iletildi/beklemede olarak gösterilir.
          </Alert>

          <Card title="Askerlik Erteleme Listesi" icon="users" hint={`${asalRows.length} öğrenci`}>
            {loading ? (
              <Skeleton lines={8} />
            ) : (
              <DataTable<StudentRow>
                rows={asalRows}
                search
                csv
                csvName="asal-askerlik"
                empty={
                  <EmptyState
                    icon="users"
                    title="Kayıt bulunamadı"
                    sub="Askerlik ertelemesine uygun erkek öğrenci yok (mock)."
                  />
                }
                columns={[
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
                    header: 'Öğrenci Durumu',
                    sortable: true,
                    value: (r) => STATUS_TR[r.status] ?? r.status,
                    render: (r) => (
                      <Badge tone={statusTone(r.status)}>{STATUS_TR[r.status] ?? r.status}</Badge>
                    ),
                  },
                  {
                    key: 'asal',
                    header: 'ASAL Durumu',
                    sortable: true,
                    value: (r) => asalStateMock(r.status),
                    render: (r) =>
                      asalStateMock(r.status) === 'onaylandi' ? (
                        <Badge tone="ok">Onaylandı</Badge>
                      ) : (
                        <Badge tone="warn">ASAL&apos;a İletildi</Badge>
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
