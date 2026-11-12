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
  Drawer,
  Icon,
  toast,
} from '@/app/ui';

type Service = 'mernis' | 'osym' | 'yoksis' | 'sgk';

interface LogRow {
  id: string;
  service: string;
  operation: string;
  subjectRef: string;
  status: string;
  response: Record<string, unknown> | null;
  createdAt: string;
}
interface QueryResult {
  logId: string;
  createdAt: string;
  response: Record<string, unknown>;
}

const SERVICES: { value: Service; label: string }[] = [
  { value: 'mernis', label: 'MERNİS' },
  { value: 'osym', label: 'ÖSYM' },
  { value: 'yoksis', label: 'YÖKSİS' },
  { value: 'sgk', label: 'SGK' },
];

const SERVICE_TR: Record<string, string> = {
  mernis: 'MERNİS',
  osym: 'ÖSYM',
  yoksis: 'YÖKSİS',
  sgk: 'SGK',
};

/** Servis başına örnek operasyon adları (mock adaptör her operasyonu kabul eder). */
const OPERATIONS: Record<Service, string[]> = {
  mernis: ['kimlik-dogrula', 'adres-sorgu'],
  osym: ['yerlesme-sorgu', 'puan-sorgu'],
  yoksis: ['ogrencilik-durumu', 'ogrenci-sorgu'],
  sgk: ['calisma-durumu', 'hizmet-dokumu'],
};

/** Sorgu referansı: YÖKSİS öğrenci numarası, diğerleri TC kimlik numarası ile çalışır. */
const REF_LABEL: Record<Service, string> = {
  mernis: 'TC Kimlik No',
  osym: 'TC Kimlik No',
  yoksis: 'Öğrenci No',
  sgk: 'TC Kimlik No',
};

/** Yanıt alanları için okunabilir etiketler; eşleşmeyen anahtar olduğu gibi gösterilir. */
const FIELD_TR: Record<string, string> = {
  _mock: 'Mock yanıt',
  service: 'Servis',
  operation: 'Operasyon',
  subjectRef: 'Referans',
  ad: 'Ad',
  soyad: 'Soyad',
  dogumTarihi: 'Doğum tarihi',
  puan: 'Puan',
  yerlestirmeKodu: 'Yerleştirme kodu',
  ogrenciNo: 'Öğrenci no',
  durum: 'Durum',
  sicilNo: 'Sicil no',
  calisiyorMu: 'Çalışıyor mu',
  isyeriKodu: 'İşyeri kodu',
  sonuc: 'Sonuç',
};

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? String(s) : new Date(t).toLocaleString('tr-TR');
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function statusTone(s: string): 'ok' | 'danger' | 'muted' {
  if (s === 'basarili') return 'ok';
  if (s === 'hatali') return 'danger';
  return 'muted';
}

function KeyValues({ data }: { data: Record<string, unknown> }): React.ReactElement {
  return (
    <div>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="list-item">
          <div className="li-main">
            <div style={{ fontWeight: 600 }}>{FIELD_TR[k] ?? k}</div>
            <div className="meta">{k}</div>
          </div>
          <div style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>
            {fmtValue(v)}
          </div>
        </div>
      ))}
    </div>
  );
}

function JsonBlock({ data }: { data: unknown }): React.ReactElement {
  return (
    <pre
      style={{
        margin: 0,
        fontSize: 12,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        color: 'var(--text-2)',
      }}
    >
      {data == null ? '—' : JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function DisServisler(): React.ReactElement {
  const [service, setService] = useState<Service>('mernis');
  const [operation, setOperation] = useState(OPERATIONS.mernis[0]!);
  const [subjectRef, setSubjectRef] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [busy, setBusy] = useState(false);

  const [all, setAll] = useState<LogRow[]>([]);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [filter, setFilter] = useState<Service | ''>('');
  const [detail, setDetail] = useState<LogRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async (): Promise<void> => {
    // Servis bazlı istatistikler tüm loglardan; tablo ise ?service filtresiyle sunucudan gelir.
    const full = await api<{ items: LogRow[] }>('/admissions-deep/external-logs');
    setAll(full.items);
    if (filter) {
      const one = await api<{ items: LogRow[] }>(
        `/admissions-deep/external-logs?service=${encodeURIComponent(filter)}`,
      );
      setRows(one.items);
    } else {
      setRows(full.items);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load()
      .then(() => setErr(''))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, [load]);

  function pickService(s: Service): void {
    setService(s);
    setOperation(OPERATIONS[s][0]!);
    setResult(null);
  }

  async function runQuery(): Promise<void> {
    if (!operation.trim() || !subjectRef.trim()) {
      toast('Eksik bilgi', { tone: 'info', body: 'Operasyon ve referans alanlarını doldurun.' });
      return;
    }
    setBusy(true);
    try {
      const res = await api<QueryResult>(`/admissions-deep/external/${service}/query`, {
        method: 'POST',
        body: { operation: operation.trim(), subjectRef: subjectRef.trim() },
      });
      setResult(res);
      toast('Sorgu tamamlandı', {
        tone: 'ok',
        body: `${SERVICE_TR[service]} · ${operation.trim()} (mock yanıt).`,
      });
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Sorgu başarısız';
      toast('Sorgu başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { mernis: 0, osym: 0, yoksis: 0, sgk: 0 };
    for (const r of all) c[r.service] = (c[r.service] ?? 0) + 1;
    return c;
  }, [all]);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Dış Servisler"
        sub="MERNİS / ÖSYM / YÖKSİS / SGK entegrasyon konsolu. Sorgular mock adaptör üzerinden yürütülür ve loglanır."
        actions={
          <Button variant="subtle" icon="refresh" onClick={() => void load()} disabled={loading || busy}>
            Yenile
          </Button>
        }
      />

      <Alert tone="info">
        Bu yanıt mock adaptörden gelmektedir; gerçek entegrasyon kurum anlaşması gerektirir.
      </Alert>

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={SERVICES.map((s) => ({
            label: `${s.label} çağrısı`,
            value: counts[s.value] ?? 0,
            icon: s.value === 'mernis' ? 'shield' : s.value === 'osym' ? 'award' : s.value === 'yoksis' ? 'building' : 'fileText',
          }))}
        />
      )}

      <Card title="Sorgu" icon="search" hint="Servisi seçin, operasyon ve referans girip sorgulayın.">
        <div className="field">
          <label>Servis</label>
          <Segmented<Service> value={service} onChange={pickService} options={SERVICES} />
        </div>

        <div className="two-col">
          <div className="field">
            <label htmlFor="operation">Operasyon</label>
            <input
              id="operation"
              value={operation}
              onChange={(e) => setOperation(e.target.value)}
              placeholder="ör. kimlik-dogrula"
            />
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              {OPERATIONS[service].map((o) => (
                <Button key={o} variant="subtle" sm onClick={() => setOperation(o)}>
                  {o}
                </Button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="subjectRef">{REF_LABEL[service]}</label>
            <input
              id="subjectRef"
              value={subjectRef}
              onChange={(e) => setSubjectRef(e.target.value)}
              placeholder={service === 'yoksis' ? 'ör. 20231234' : 'ör. 12345678901'}
            />
            <div className="hint-sm">Sorgu referansı; log kaydında saklanır.</div>
          </div>
        </div>

        <Button icon="activity" onClick={() => void runQuery()} disabled={busy}>
          {busy ? 'Sorgulanıyor…' : 'Sorgula'}
        </Button>
      </Card>

      {result && (
        <Card
          title="Servis Yanıtı"
          icon="fileText"
          hint={`${SERVICE_TR[service] ?? service} · ${fmtDateTime(result.createdAt)}`}
          actions={<Badge tone="info">mock</Badge>}
        >
          <KeyValues data={result.response} />
          <hr className="divider" />
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            Ham JSON
          </div>
          <JsonBlock data={result.response} />
        </Card>
      )}

      <Card
        title="Çağrı Logları"
        icon="layers"
        hint={`${rows.length} kayıt`}
        actions={
          <Segmented<Service | ''>
            value={filter}
            onChange={setFilter}
            options={[{ value: '', label: 'Tümü' }, ...SERVICES]}
          />
        }
      >
        {loading ? (
          <Skeleton lines={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="Çağrı kaydı yok"
            sub="Seçili servis için henüz sorgu yapılmamış. Yukarıdaki formdan bir sorgu çalıştırın."
          />
        ) : (
          <DataTable<LogRow>
            rows={rows}
            search
            csv
            csvName="dis-servis-loglari"
            columns={[
              {
                key: 'service',
                header: 'Servis',
                sortable: true,
                value: (r) => SERVICE_TR[r.service] ?? r.service,
                render: (r) => <b>{SERVICE_TR[r.service] ?? r.service}</b>,
              },
              { key: 'operation', header: 'Operasyon', sortable: true, value: (r) => r.operation },
              { key: 'subjectRef', header: 'Referans', sortable: true, value: (r) => r.subjectRef },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => r.status,
                render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                sortable: true,
                value: (r) => r.createdAt,
                render: (r) => fmtDateTime(r.createdAt),
              },
              {
                key: 'act',
                header: '',
                sortable: false,
                render: (r) => (
                  <Button variant="subtle" sm icon="eye" onClick={() => setDetail(r)}>
                    Yanıt
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={
          <span className="row" style={{ gap: 8 }}>
            <Icon name="fileText" size={16} />
            {detail ? `${SERVICE_TR[detail.service] ?? detail.service} · ${detail.operation}` : ''}
          </span>
        }
      >
        {detail && (
          <>
            <div className="list-item">
              <div className="li-main">
                <div style={{ fontWeight: 600 }}>Referans</div>
                <div className="meta">{fmtDateTime(detail.createdAt)}</div>
              </div>
              <Badge tone={statusTone(detail.status)}>{detail.status}</Badge>
            </div>
            <div style={{ fontWeight: 700, fontSize: 13.5, margin: '14px 0 4px' }}>
              {detail.subjectRef}
            </div>
            <hr className="divider" />
            {detail.response === null ? (
              <EmptyState icon="inbox" title="Yanıt yok" sub="Bu çağrı için kayıtlı yanıt bulunmuyor." />
            ) : (
              <>
                <KeyValues data={detail.response} />
                <hr className="divider" />
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  Ham JSON
                </div>
                <JsonBlock data={detail.response} />
              </>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
