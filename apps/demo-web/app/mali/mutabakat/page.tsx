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
  EmptyState,
  Skeleton,
  Meter,
  Alert,
  Segmented,
  toast,
  money,
} from '@/app/ui';

interface ReconResult {
  matched: number;
  unmatched: number;
}
interface ReconItem {
  id: string;
  bankRef: string;
  amount: number;
  importedAt: string;
  matchedPaymentId: string | null;
  matchedStudentNo: string | null;
  matchedStudentName: string | null;
  matchedInvoiceId: string | null;
}
interface ReconReport {
  items: ReconItem[];
  summary: { total: number; matched: number; unmatched: number };
}
interface ParsedRow {
  bankRef: string;
  amount: number; // kuruş
  raw: string;
  ok: boolean;
}

const dt = (iso: string): string =>
  new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const SAMPLE = `HAVALE-2026-0001;1250,00
HAVALE-2026-0002;3400,50
EFT-2026-0777;980,00`;

/** "bankRef;tutar" satırlarını ayrıştırır (tutar TL, virgül/nokta kabul). */
function parse(text: string): ParsedRow[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [ref, amt] = line.split(';');
      const bankRef = (ref ?? '').trim();
      const tl = parseFloat((amt ?? '').trim().replace(',', '.'));
      const kurus = Math.round(tl * 100);
      const ok = bankRef.length > 0 && Number.isFinite(kurus) && kurus > 0;
      return { bankRef, amount: ok ? kurus : 0, raw: line, ok };
    });
}

export default function Mutabakat(): React.ReactElement {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReconResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [report, setReport] = useState<ReconReport | null>(null);
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [repBusy, setRepBusy] = useState(true);
  const [repErr, setRepErr] = useState('');

  const [matchFor, setMatchFor] = useState<ReconItem | null>(null);
  const [paymentId, setPaymentId] = useState('');
  const [matchBusy, setMatchBusy] = useState(false);

  const rows = useMemo(() => parse(text), [text]);
  const validRows = rows.filter((r) => r.ok);
  const invalidRows = rows.filter((r) => !r.ok);
  const invalidCount = invalidRows.length;
  const totalKurus = validRows.reduce((a, r) => a + r.amount, 0);

  const loadReport = useCallback(async (unmatched: boolean): Promise<void> => {
    setRepBusy(true);
    setRepErr('');
    try {
      const r = await api<ReconReport>(
        `/finance/reconciliation${unmatched ? '?unmatched=true' : ''}`,
      );
      setReport(r);
    } catch (e) {
      setRepErr(e instanceof Error ? e.message : 'Mutabakat raporu alınamadı');
    } finally {
      setRepBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadReport(onlyUnmatched);
  }, [onlyUnmatched, loadReport]);

  async function importFile(): Promise<void> {
    setErr('');
    setResult(null);
    if (validRows.length === 0) {
      setErr('İçe aktarılacak geçerli banka kaydı yok.');
      return;
    }
    setBusy(true);
    try {
      const res = await api<ReconResult>('/finance/reconciliation/import', {
        method: 'POST',
        body: {
          records: validRows.map((r) => ({ bankRef: r.bankRef, amount: r.amount })),
        },
      });
      setResult(res);
      toast('Mutabakat tamamlandı', {
        tone: 'ok',
        body: `${res.matched} kayıt eşleşti, ${res.unmatched} kayıt istisna raporuna alındı.`,
      });
      setText('');
      await loadReport(onlyUnmatched);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İçe aktarma başarısız';
      setErr(m);
      toast('İçe aktarma başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function doMatch(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!matchFor) return;
    if (!/^[0-9a-fA-F-]{36}$/.test(paymentId.trim())) {
      setErr('Geçerli bir ödeme UUID girin.');
      return;
    }
    setMatchBusy(true);
    setErr('');
    try {
      await api(`/finance/reconciliation/${matchFor.id}/match`, {
        method: 'POST',
        body: { paymentId: paymentId.trim() },
      });
      toast('İstisna çözüldü', {
        tone: 'ok',
        body: 'Banka kaydı ilgili ödemeye bağlandı.',
      });
      setMatchFor(null);
      setPaymentId('');
      await loadReport(onlyUnmatched);
    } catch (e2) {
      const m = e2 instanceof Error ? e2.message : 'Eşleştirme başarısız';
      setErr(m);
      toast('Eşleştirme başarısız', { tone: 'err', body: m });
    } finally {
      setMatchBusy(false);
    }
  }

  const s = report?.summary;
  const matchRate = s && s.total > 0 ? Math.round((s.matched / s.total) * 100) : 0;

  const reportColumns = [
    { key: 'bankRef', header: 'Banka Ref', sortable: true, value: (i: ReconItem) => i.bankRef },
    {
      key: 'amount',
      header: 'Tutar',
      num: true,
      sortable: true,
      value: (i: ReconItem) => i.amount,
      render: (i: ReconItem) => money(i.amount),
    },
    {
      key: 'importedAt',
      header: 'Tarih',
      sortable: true,
      value: (i: ReconItem) => i.importedAt,
      render: (i: ReconItem) => <span className="muted">{dt(i.importedAt)}</span>,
    },
    {
      key: 'match',
      header: 'Eşleşme',
      value: (i: ReconItem) => (i.matchedPaymentId ? 'eşleşti' : 'açık istisna'),
      render: (i: ReconItem) =>
        i.matchedPaymentId ? (
          <div>
            <Badge tone="ok">eşleşti</Badge>
            {i.matchedStudentNo && (
              <div className="meta">
                {i.matchedStudentNo} · {i.matchedStudentName}
              </div>
            )}
          </div>
        ) : (
          <Badge tone="danger">açık istisna</Badge>
        ),
    },
    {
      key: 'act',
      header: '',
      render: (i: ReconItem) =>
        !i.matchedPaymentId ? (
          <Button
            variant="ghost"
            sm
            icon="link"
            onClick={() => {
              setMatchFor(i);
              setPaymentId('');
              setErr('');
            }}
          >
            Ödemeye bağla
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Banka Mutabakatı"
        sub="Banka dosyasını içe aktarın; sistem ödemelerle tutar bazında eşleştirir. Eşleşmeyen kayıtlar istisna raporunda kalır ve manuel olarak bir ödemeye bağlanabilir."
        actions={
          <Button variant="ghost" icon="refresh" onClick={() => void loadReport(onlyUnmatched)}>
            Yenile
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      <StatGrid
        stats={[
          { label: 'Toplam banka kaydı', value: s ? s.total : '—', icon: 'file' },
          { label: 'Eşleşen', value: s ? s.matched : '—', icon: 'checkCircle', tone: 'ok' },
          {
            label: 'Açık istisna',
            value: s ? s.unmatched : '—',
            icon: 'alert',
            tone: (s?.unmatched ?? 0) > 0 ? 'danger' : 'ok',
          },
          {
            label: 'Eşleşme oranı',
            value: s ? `${matchRate}%` : '—',
            icon: 'target',
            tone: matchRate >= 80 ? 'ok' : matchRate >= 50 ? 'warn' : 'danger',
          },
        ]}
      />

      {s && s.total > 0 && (
        <Card title="Eşleşme Oranı" icon="chart" hint="Eşleşen banka kaydı / toplam kayıt.">
          <Meter value={matchRate} label={`%${matchRate} eşleşti`} />
        </Card>
      )}

      <Card
        title="Banka Dosyası İçe Aktar"
        icon="upload"
        hint={
          <>
            Her satır <code>BANKA_REF;TUTAR</code> biçiminde (tutar ₺, örn.{' '}
            <code>HAVALE-2026-0001;1250,00</code>).
          </>
        }
      >
        <div className="field">
          <label>Mutabakat verisi</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={SAMPLE}
            style={{
              width: '100%',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 13,
              padding: 10,
              borderRadius: 8,
              border: '1px solid var(--line)',
            }}
          />
        </div>
        {rows.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <StatGrid
              stats={[
                { label: 'Geçerli satır', value: validRows.length, icon: 'check', tone: 'ok' },
                {
                  label: 'Hatalı satır',
                  value: invalidCount,
                  icon: 'alert',
                  tone: invalidCount ? 'warn' : 'ok',
                },
                { label: 'Toplam tutar', value: money(totalKurus), icon: 'money' },
              ]}
            />
          </div>
        )}
        <div className="row">
          <Button variant="subtle" sm type="button" icon="file" onClick={() => setText(SAMPLE)}>
            Örnek veriyi doldur
          </Button>
          <Button
            variant="ok"
            type="button"
            icon="upload"
            onClick={importFile}
            disabled={busy || validRows.length === 0}
          >
            {busy ? 'İçe aktarılıyor…' : `İçe Aktar & Eşleştir (${validRows.length})`}
          </Button>
        </div>

        {invalidRows.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Alert tone="warn">
              {invalidRows.length} satır ayrıştırılamadı; içe aktarmada atlanacak.
            </Alert>
            <table style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Satır</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {invalidRows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span className="muted">{r.raw}</span>
                    </td>
                    <td>
                      <Badge tone="danger">ayrıştırılamadı</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result && (
          <div className="info-box" style={{ marginTop: 12 }}>
            Son içe aktarma: {result.matched} eşleşti, {result.unmatched} istisnaya alındı.
          </div>
        )}
      </Card>

      <Card
        title="Mutabakat / İstisna Raporu"
        icon="inbox"
        actions={
          <Segmented
            value={onlyUnmatched ? 'unmatched' : 'all'}
            onChange={(v) => setOnlyUnmatched(v === 'unmatched')}
            options={[
              { value: 'all', label: 'Tümü' },
              { value: 'unmatched', label: 'Açık istisnalar' },
            ]}
          />
        }
      >
        {repErr && <Alert tone="err">{repErr}</Alert>}

        {repBusy ? (
          <Skeleton lines={5} />
        ) : !report || report.items.length === 0 ? (
          <EmptyState
            icon={onlyUnmatched ? 'checkCircle' : 'inbox'}
            title={onlyUnmatched ? 'Açık istisna yok' : 'Kayıt bulunmuyor'}
            sub={
              onlyUnmatched
                ? 'Tüm banka kayıtları bir ödemeyle eşleşti.'
                : 'Henüz kayıtlı banka mutabakatı yok. Yukarıdan dosya içe aktarın.'
            }
          />
        ) : (
          <DataTable
            rows={report.items}
            columns={reportColumns}
            csv
            csvName="mutabakat-raporu"
            pageSize={20}
          />
        )}

        {matchFor && (
          <form onSubmit={doMatch} style={{ marginTop: 12 }}>
            <div className="info-box" style={{ marginBottom: 10 }}>
              İstisna çözümü: <strong>{matchFor.bankRef}</strong> ({money(matchFor.amount)}) banka
              kaydını bir ödeme kaydına bağlayın. Ödeme UUID’sini ilgili öğrencinin ekstresindeki
              dekonttan alın.
            </div>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '2 1 300px', marginBottom: 0 }}>
                <label>Ödeme UUID</label>
                <input
                  value={paymentId}
                  onChange={(e) => setPaymentId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  required
                />
              </div>
              <Button variant="ok" type="submit" icon="link" disabled={matchBusy}>
                {matchBusy ? 'Bağlanıyor…' : 'Bağla'}
              </Button>
              <Button variant="ghost" type="button" onClick={() => setMatchFor(null)}>
                Vazgeç
              </Button>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
