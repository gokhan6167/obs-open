'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, DataTable, Badge, Button, Alert, EmptyState,
  Skeleton, Segmented, toast, fmtDate,
} from '@/app/ui';

interface Internship {
  id: string;
  company: string;
  position: string | null;
  startsOn: string | null;
  endsOn: string | null;
  days: number | null;
  insuranceDone: boolean;
  logbookSubmitted: boolean;
  grade: string | null;
  status: string;
  createdAt: string;
}

const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  basvuruldu: 'warn',
  onaylandi: 'info',
  devam: 'info',
  tamamlandi: 'ok',
  reddedildi: 'danger',
};
const TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  onaylandi: 'Onaylandı',
  devam: 'Devam Ediyor',
  tamamlandi: 'Tamamlandı',
  reddedildi: 'Reddedildi',
};

const TABS: { value: 'list' | 'new'; label: string }[] = [
  { value: 'list', label: 'Stajlarım' },
  { value: 'new', label: 'Yeni Başvuru' },
];

export default function Stajim(): React.ReactElement {
  const [tab, setTab] = useState<'list' | 'new'>('list');
  const [rows, setRows] = useState<Internship[]>([]);
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [days, setDays] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => setRows(await api<Internship[]>('/internships/my')), []);

  useEffect(() => {
    api<Internship[]>('/internships/my')
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, []);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!company.trim()) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await api('/internships', {
        method: 'POST',
        body: {
          company: company.trim(),
          position: position.trim() || undefined,
          startsOn: startsOn || undefined,
          endsOn: endsOn || undefined,
          days: days ? Number(days) : undefined,
        },
      });
      setMsg('Staj başvurunuz alındı.');
      setCompany('');
      setPosition('');
      setStartsOn('');
      setEndsOn('');
      setDays('');
      await loadList();
      setTab('list');
      toast('Başvuru alındı', { tone: 'ok', body: 'Staj başvurunuz komisyon onayına iletildi.' });
    } catch (e2) {
      const m = e2 instanceof Error ? e2.message : 'Başvuru başarısız';
      setErr(m);
      toast('Başvuru başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Stajım"
        sub="Staj başvurusu oluştur; sigorta, defter ve not durumunu takip et."
      />

      <div style={{ marginBottom: 16 }}>
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Alert tone="info">
          Sigorta girişi yapılmadan staj başlatılamaz. Staj defteri teslim edilmeden başarılı notu verilmez.
        </Alert>
      </div>

      {tab === 'list' ? (
        <Card icon="building" title="Stajlarım" className="reveal">
          {loading ? (
            <Skeleton lines={4} />
          ) : err ? (
            <Alert tone="err">{err}</Alert>
          ) : rows.length === 0 ? (
            <EmptyState
              icon="building"
              title="Henüz staj kaydı yok"
              sub="Yeni Başvuru sekmesinden staj başvurusu oluşturabilirsiniz."
              action={<Button icon="arrowRight" onClick={() => setTab('new')}>Yeni Başvuru</Button>}
            />
          ) : (
            <DataTable
              rows={rows}
              csv
              csvName="stajlarim"
              empty="Kayıt bulunamadı."
              columns={[
                { key: 'company', header: 'Firma', value: (r) => r.company },
                {
                  key: 'position', header: 'Pozisyon', value: (r) => r.position ?? '',
                  render: (r) => r.position ?? <span className="muted">—</span>,
                },
                {
                  key: 'dates', header: 'Tarih', value: (r) => r.startsOn ?? '',
                  render: (r) => (
                    <span>
                      {r.startsOn ? fmtDate(r.startsOn) : '—'} – {r.endsOn ? fmtDate(r.endsOn) : '—'}
                      {r.days ? <span className="muted"> ({r.days} gün)</span> : null}
                    </span>
                  ),
                },
                {
                  key: 'insurance', header: 'Sigorta', value: (r) => (r.insuranceDone ? 'Yapıldı' : 'Bekliyor'),
                  render: (r) => (
                    <Badge tone={r.insuranceDone ? 'ok' : 'warn'}>{r.insuranceDone ? 'Yapıldı' : 'Bekliyor'}</Badge>
                  ),
                },
                {
                  key: 'logbook', header: 'Defter', value: (r) => (r.logbookSubmitted ? 'Teslim' : 'Bekliyor'),
                  render: (r) => (
                    <Badge tone={r.logbookSubmitted ? 'ok' : 'warn'}>{r.logbookSubmitted ? 'Teslim' : 'Bekliyor'}</Badge>
                  ),
                },
                {
                  key: 'status', header: 'Durum', value: (r) => TR[r.status] ?? r.status,
                  render: (r) => <Badge tone={BADGE[r.status] ?? 'muted'}>{TR[r.status] ?? r.status}</Badge>,
                },
                {
                  key: 'grade', header: 'Not', value: (r) => r.grade ?? '',
                  render: (r) => r.grade ?? <span className="muted">—</span>,
                },
              ]}
            />
          )}
        </Card>
      ) : (
        <Card icon="edit" title="Yeni Staj Başvurusu" className="reveal">
          {msg && <Alert tone="ok">{msg}</Alert>}
          {err && <Alert tone="err">{err}</Alert>}
          <form onSubmit={submit}>
            <div className="field">
              <label>Firma *</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Staj yapılacak firma adı"
                maxLength={200}
                required
              />
            </div>
            <div className="field">
              <label>Pozisyon</label>
              <input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Örn. Yazılım Geliştirme Stajyeri"
                maxLength={200}
              />
            </div>
            <div className="field">
              <label>Başlangıç Tarihi</label>
              <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="field">
              <label>Bitiş Tarihi</label>
              <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
            <div className="field">
              <label>İş Günü</label>
              <input
                type="number"
                min={1}
                max={400}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="Örn. 20"
              />
            </div>
            <Button type="submit" icon="arrowRight" disabled={busy || !company.trim()}>
              {busy ? 'Gönderiliyor…' : 'Başvur'}
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
