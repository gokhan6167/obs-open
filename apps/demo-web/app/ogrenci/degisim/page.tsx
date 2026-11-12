'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiList } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert, Segmented,
  EmptyState, Skeleton, SkeletonStats, toast, fmtDate,
} from '@/app/ui';

interface Exchange {
  id: string;
  program: string;
  direction: string;
  partnerUniversity: string;
  term: string;
  status: string;
  createdAt: string;
}

type Tab = 'liste' | 'yeni';

const PROGRAMS = [
  { value: 'erasmus', label: 'Erasmus' },
  { value: 'farabi', label: 'Farabi' },
  { value: 'mevlana', label: 'Mevlana' },
] as const;
type Program = (typeof PROGRAMS)[number]['value'];

const PROGRAM_TR: Record<string, string> = {
  erasmus: 'Erasmus',
  farabi: 'Farabi',
  mevlana: 'Mevlana',
};
const DIR_TR: Record<string, string> = {
  giden: 'Giden',
  gelen: 'Gelen',
};

const STATUS_TR: Record<string, string> = {
  submitted: 'Başvuruldu',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  accepted: 'Kabul',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};
const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  submitted: 'warn',
  in_review: 'info',
  approved: 'ok',
  accepted: 'ok',
  rejected: 'danger',
  cancelled: 'danger',
};

export default function Degisim(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('liste');
  const [rows, setRows] = useState<Exchange[]>([]);
  const [program, setProgram] = useState<Program>('erasmus');
  const [university, setUniversity] = useState('');
  const [term, setTerm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => setRows(await apiList<Exchange>('/exchange/my')), []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const pending = useMemo(
    () => rows.filter((r) => r.status === 'submitted' || r.status === 'in_review').length,
    [rows],
  );
  const accepted = useMemo(
    () => rows.filter((r) => r.status === 'approved' || r.status === 'accepted').length,
    [rows],
  );

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await api('/exchange', {
        method: 'POST',
        body: {
          program,
          direction: 'giden',
          partnerUniversity: university.trim(),
          term: term.trim(),
        },
      });
      setMsg(`${PROGRAM_TR[program]} başvurunuz alındı; ilgili birimin onayına düştü.`);
      setUniversity('');
      setTerm('');
      await load();
      setTab('liste');
      toast('Başvuru alındı', { tone: 'ok', body: `${PROGRAM_TR[program]} değişim başvurunuz iletildi.` });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Başvuru oluşturulamadı';
      setErr(m);
      toast('Başvuru oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Değişim Programları"
        sub="Erasmus, Farabi ve Mevlana değişim başvurularını oluştur ve durumunu takip et."
      />

      {loading ? (
        <>
          <SkeletonStats n={3} />
          <Skeleton lines={4} />
        </>
      ) : (
        <>
          {rows.length > 0 && (
            <StatGrid
              stats={[
                { label: 'Toplam başvuru', value: rows.length, icon: 'fileText' },
                { label: 'Beklemede', value: pending, icon: 'clock', tone: pending > 0 ? 'warn' : undefined },
                { label: 'Onaylanan', value: accepted, icon: 'checkCircle', tone: 'ok' },
              ]}
            />
          )}

          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'liste', label: 'Başvurularım' },
              { value: 'yeni', label: 'Yeni' },
            ]}
          />

          {tab === 'liste' ? (
            <Card icon="fileText" title="Başvurularım">
              {err && <Alert tone="err">{err}</Alert>}
              {rows.length === 0 ? (
                <EmptyState
                  icon="fileText"
                  title="Henüz değişim başvurusu yok"
                  sub="Yeni sekmesinden Erasmus, Farabi veya Mevlana programı için başvuru oluşturabilirsiniz."
                />
              ) : (
                <DataTable
                  rows={rows}
                  csv
                  csvName="degisim-basvurularim"
                  empty="Kayıt bulunamadı."
                  columns={[
                    {
                      key: 'program', header: 'Program',
                      value: (r) => PROGRAM_TR[r.program] ?? r.program,
                      render: (r) => <b>{PROGRAM_TR[r.program] ?? r.program}</b>,
                    },
                    {
                      key: 'direction', header: 'Yön',
                      value: (r) => DIR_TR[r.direction] ?? r.direction,
                      render: (r) => <span>{DIR_TR[r.direction] ?? r.direction}</span>,
                    },
                    {
                      key: 'partnerUniversity', header: 'Üniversite',
                      value: (r) => r.partnerUniversity,
                    },
                    {
                      key: 'term', header: 'Dönem',
                      value: (r) => r.term,
                    },
                    {
                      key: 'status', header: 'Durum',
                      value: (r) => STATUS_TR[r.status] ?? r.status,
                      render: (r) => <Badge tone={BADGE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>,
                    },
                    {
                      key: 'createdAt', header: 'Tarih',
                      value: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt),
                    },
                  ]}
                />
              )}
            </Card>
          ) : (
            <Card icon="edit" title="Yeni Değişim Başvurusu">
              {msg && <Alert tone="ok">{msg}</Alert>}
              {err && <Alert tone="err">{err}</Alert>}
              <form onSubmit={submit}>
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                    <label>Program</label>
                    <select value={program} onChange={(e) => setProgram(e.target.value as Program)}>
                      {PROGRAMS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ flex: '3 1 280px', marginBottom: 0 }}>
                    <label>Partner üniversite</label>
                    <input
                      value={university}
                      onChange={(e) => setUniversity(e.target.value)}
                      placeholder="Örn. University of Bologna"
                      required
                    />
                  </div>
                  <div className="field" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                    <label>Dönem</label>
                    <input
                      value={term}
                      onChange={(e) => setTerm(e.target.value)}
                      placeholder="Örn. 2025-2026 Güz"
                      required
                    />
                  </div>
                  <Button type="submit" icon="arrowRight" disabled={busy || !university.trim() || !term.trim()}>
                    {busy ? 'Gönderiliyor…' : 'Başvur'}
                  </Button>
                </div>
                <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
                  Yön: Giden (yurt dışı/kurum dışına gidiş).
                </p>
              </form>
            </Card>
          )}
        </>
      )}
    </>
  );
}
