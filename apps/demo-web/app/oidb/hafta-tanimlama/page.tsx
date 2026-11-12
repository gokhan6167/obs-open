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
  Drawer,
  Alert,
  Skeleton,
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

type Term = 'guz' | 'bahar' | 'yaz';

interface AcademicWeek {
  id: string;
  year: number;
  term: Term;
  weekNo: number;
  startsOn: string;
  note?: string | null;
}

const TERM_LABEL: Record<Term, string> = {
  guz: 'Güz',
  bahar: 'Bahar',
  yaz: 'Yaz',
};
const TERM_TONE: Record<Term, 'info' | 'ok' | 'warn'> = {
  guz: 'info',
  bahar: 'ok',
  yaz: 'warn',
};

const CURRENT_YEAR = new Date().getFullYear();

export default function HaftaTanimlama(): React.ReactElement {
  const [weeks, setWeeks] = useState<AcademicWeek[]>([]);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Filtreler
  const [fYear, setFYear] = useState('');
  const [fTerm, setFTerm] = useState<'' | Term>('');

  // Yeni hafta paneli
  const [open, setOpen] = useState(false);
  const [nYear, setNYear] = useState(String(CURRENT_YEAR));
  const [nTerm, setNTerm] = useState<Term>('guz');
  const [nWeekNo, setNWeekNo] = useState('1');
  const [nStartsOn, setNStartsOn] = useState('');
  const [nNote, setNNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fYear.trim()) qs.set('year', fYear.trim());
    if (fTerm) qs.set('term', fTerm);
    const q = qs.toString();
    const rows = await api<AcademicWeek[]>(`/academic-weeks${q ? `?${q}` : ''}`);
    setWeeks(rows ?? []);
    setLoaded(true);
  }, [fYear, fTerm]);

  useEffect(() => {
    setLoaded(false);
    setErr('');
    load().catch((e) => {
      setErr(e instanceof Error ? e.message : 'Hata');
      setLoaded(true);
    });
  }, [load]);

  const openPanel = useCallback(() => {
    setNYear(fYear.trim() || String(CURRENT_YEAR));
    setNTerm(fTerm || 'guz');
    setNWeekNo('1');
    setNStartsOn('');
    setNNote('');
    setOpen(true);
  }, [fYear, fTerm]);

  const create = useCallback(async () => {
    const year = Number(nYear);
    const weekNo = Number(nWeekNo);
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(weekNo) ||
      weekNo <= 0 ||
      !nStartsOn
    ) {
      toast('Eksik bilgi', {
        tone: 'err',
        body: 'Geçerli yıl, hafta no ve başlangıç tarihi zorunludur.',
      });
      return;
    }
    setSaving(true);
    try {
      await api('/academic-weeks', {
        method: 'POST',
        body: {
          year,
          term: nTerm,
          weekNo,
          startsOn: nStartsOn,
          note: nNote.trim() || undefined,
        },
      });
      toast('Hafta eklendi', {
        tone: 'ok',
        body: `${year} · ${TERM_LABEL[nTerm]} · ${weekNo}. hafta`,
      });
      setOpen(false);
      await load();
    } catch (e) {
      toast('Hafta eklenemedi', {
        tone: 'err',
        body: e instanceof Error ? e.message : 'Hata',
      });
    } finally {
      setSaving(false);
    }
  }, [nYear, nTerm, nWeekNo, nStartsOn, nNote, load]);

  const rows = useMemo(
    () =>
      [...weeks].sort(
        (a, b) =>
          b.year - a.year ||
          a.term.localeCompare(b.term) ||
          a.weekNo - b.weekNo,
      ),
    [weeks],
  );

  const stats = useMemo(() => {
    const years = new Set(weeks.map((w) => w.year)).size;
    const terms = new Set(weeks.map((w) => `${w.year}-${w.term}`)).size;
    return { years, terms };
  }, [weeks]);

  return (
    <>
      <PageHeader
        title="Hafta Tanımlama"
        sub="Akademik dönem haftalarını yıl ve döneme göre tanımlayın."
        actions={
          <Button icon="calendar" onClick={openPanel}>
            Yeni Hafta
          </Button>
        }
      />

      <Card title="Filtre" icon="search" hint="Yıl ve döneme göre süzün.">
        <div className="row" style={{ gap: 12, marginBottom: 0, alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Yıl</label>
            <input
              type="number"
              min={2000}
              max={2100}
              value={fYear}
              onChange={(e) => setFYear(e.target.value)}
              placeholder="örn. 2026"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Dönem</label>
            <select
              value={fTerm}
              onChange={(e) => setFTerm(e.target.value as '' | Term)}
              aria-label="Dönem"
            >
              <option value="">Tümü</option>
              <option value="guz">Güz</option>
              <option value="bahar">Bahar</option>
              <option value="yaz">Yaz</option>
            </select>
          </div>
          {(fYear || fTerm) && (
            <Button
              variant="subtle"
              icon="x"
              onClick={() => {
                setFYear('');
                setFTerm('');
              }}
            >
              Temizle
            </Button>
          )}
        </div>
      </Card>

      {err ? (
        <Alert tone="err">{err}</Alert>
      ) : !loaded ? (
        <Skeleton lines={6} />
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Toplam hafta', value: weeks.length, icon: 'calendar' },
              { label: 'Yıl sayısı', value: stats.years, icon: 'grade' },
              { label: 'Dönem sayısı', value: stats.terms, icon: 'book' },
            ]}
          />

          <Card
            title="Tanımlı haftalar"
            icon="calendar"
            hint={`${rows.length} kayıt`}
          >
            <DataTable<AcademicWeek>
              rows={rows}
              csv
              csvName="akademik-haftalar"
              empty={
                <EmptyState
                  icon="calendar"
                  title="Tanımlı hafta yok"
                  sub="Seçilen filtre için henüz hafta tanımlanmamış. Yeni hafta ekleyin."
                />
              }
              columns={[
                {
                  key: 'year',
                  header: 'Yıl',
                  num: true,
                  value: (r) => r.year,
                },
                {
                  key: 'term',
                  header: 'Dönem',
                  value: (r) => TERM_LABEL[r.term],
                  render: (r) => (
                    <Badge tone={TERM_TONE[r.term]}>{TERM_LABEL[r.term]}</Badge>
                  ),
                },
                {
                  key: 'weekNo',
                  header: 'Hafta No',
                  num: true,
                  value: (r) => r.weekNo,
                  render: (r) => <b>{r.weekNo}. hafta</b>,
                },
                {
                  key: 'startsOn',
                  header: 'Başlangıç',
                  value: (r) => r.startsOn,
                  render: (r) => fmtDate(r.startsOn),
                },
                {
                  key: 'note',
                  header: 'Not',
                  sortable: false,
                  value: (r) => r.note ?? '',
                  render: (r) =>
                    r.note ? r.note : <span className="muted">—</span>,
                },
              ]}
            />
          </Card>
        </>
      )}

      <Drawer open={open} onClose={() => setOpen(false)} title="Yeni Hafta">
        <div className="field">
          <label>Yıl</label>
          <input
            type="number"
            min={2000}
            max={2100}
            value={nYear}
            onChange={(e) => setNYear(e.target.value)}
            placeholder="örn. 2026"
          />
        </div>
        <div className="field">
          <label>Dönem</label>
          <select
            value={nTerm}
            onChange={(e) => setNTerm(e.target.value as Term)}
            aria-label="Dönem"
          >
            <option value="guz">Güz</option>
            <option value="bahar">Bahar</option>
            <option value="yaz">Yaz</option>
          </select>
        </div>
        <div className="field">
          <label>Hafta No</label>
          <input
            type="number"
            min={1}
            max={53}
            value={nWeekNo}
            onChange={(e) => setNWeekNo(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Başlangıç tarihi</label>
          <input
            type="date"
            value={nStartsOn}
            onChange={(e) => setNStartsOn(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Not</label>
          <input
            value={nNote}
            onChange={(e) => setNNote(e.target.value)}
            placeholder="isteğe bağlı"
            maxLength={240}
          />
        </div>
        <Button block icon="check" onClick={create} disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Haftayı Ekle'}
        </Button>
      </Drawer>
    </>
  );
}
