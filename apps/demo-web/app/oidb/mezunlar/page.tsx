'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Button,
  Alert,
  Skeleton,
  EmptyState,
  Drawer,
  toast,
} from '@/app/ui';

interface Alumnus {
  id: string;
  fullName: string;
  graduationYear: number;
  programName: string;
  email: string;
  employment: string | null;
}

interface NewAlumnus {
  fullName: string;
  graduationYear: string;
  programName: string;
  email: string;
  employment: string;
}

const EMPTY_FORM: NewAlumnus = {
  fullName: '',
  graduationYear: '',
  programName: '',
  email: '',
  employment: '',
};

export default function Mezunlar(): React.ReactElement {
  const [rows, setRows] = useState<Alumnus[]>([]);
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState('');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewAlumnus>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (y: string) => {
    const q = y.trim() ? `?year=${encodeURIComponent(y.trim())}` : '';
    const res = await api<{ items: Alumnus[] }>(`/alumni${q}`);
    setRows(res.items);
  }, []);

  useEffect(() => {
    setLoading(true);
    setListErr('');
    load(year)
      .catch((e) => setListErr(e instanceof Error ? e.message : 'Mezunlar alınamadı'))
      .finally(() => setLoading(false));
  }, [load, year]);

  const stats = useMemo(() => {
    const total = rows.length;
    const employed = rows.filter((r) => (r.employment ?? '').trim() !== '').length;
    const rate = total > 0 ? Math.round((employed / total) * 100) : 0;
    return { total, employed, rate };
  }, [rows]);

  const set = (k: keyof NewAlumnus, v: string): void => setForm((f) => ({ ...f, [k]: v }));

  const valid =
    form.fullName.trim() !== '' &&
    form.programName.trim() !== '' &&
    form.email.trim() !== '' &&
    /^\d{4}$/.test(form.graduationYear.trim());

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setErr('');
    try {
      await api('/alumni', {
        method: 'POST',
        body: {
          fullName: form.fullName.trim(),
          graduationYear: Number(form.graduationYear.trim()),
          programName: form.programName.trim(),
          email: form.email.trim(),
          employment: form.employment.trim() || null,
        },
      });
      toast('Mezun kaydedildi', { tone: 'ok', body: form.fullName.trim() });
      setForm(EMPTY_FORM);
      setOpen(false);
      await load(year);
    } catch (er) {
      const m = er instanceof Error ? er.message : 'Kayıt başarısız';
      setErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Mezunlar"
        sub="Mezun kayıtlarını yönetin, yıla göre filtreleyin ve istihdam oranını izleyin."
        actions={
          <Button variant="primary" icon="edit" onClick={() => setOpen(true)}>
            Yeni mezun
          </Button>
        }
      />

      <StatGrid
        stats={[
          { label: 'Toplam mezun', value: stats.total, icon: 'users' },
          { label: 'İstihdam edilen', value: stats.employed, icon: 'building', tone: 'ok' },
          {
            label: 'İstihdam oranı',
            value: `%${stats.rate}`,
            icon: 'activity',
            tone: stats.rate >= 50 ? 'ok' : stats.rate > 0 ? 'warn' : undefined,
          },
        ]}
      />

      <Card
        title="Mezun listesi"
        icon="award"
        hint="Belirli bir mezuniyet yılına göre süzmek için yıl girin."
        actions={
          <div className="field" style={{ marginBottom: 0, minWidth: 140 }}>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="Yıl (örn. 2024)"
              aria-label="Mezuniyet yılı filtresi"
            />
          </div>
        }
      >
        {listErr && <Alert tone="err">{listErr}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Alumnus>
            rows={rows}
            search
            csv
            csvName="oidb-mezunlar"
            empty={
              <EmptyState
                icon="award"
                title="Mezun kaydı yok"
                sub={year.trim() ? `${year.trim()} yılı için kayıt bulunamadı.` : 'Henüz mezun eklenmemiş.'}
              />
            }
            columns={[
              {
                key: 'fullName',
                header: 'Ad Soyad',
                sortable: true,
                value: (r) => r.fullName,
                render: (r) => <b>{r.fullName}</b>,
              },
              {
                key: 'graduationYear',
                header: 'Mezuniyet Yılı',
                sortable: true,
                num: true,
                value: (r) => r.graduationYear,
              },
              { key: 'programName', header: 'Program', sortable: true, value: (r) => r.programName },
              { key: 'email', header: 'E-posta', sortable: true, value: (r) => r.email },
              {
                key: 'employment',
                header: 'Çalıştığı Yer',
                sortable: true,
                value: (r) => r.employment ?? '',
                render: (r) => r.employment?.trim() || '—',
              },
            ]}
          />
        )}
      </Card>

      <Drawer open={open} onClose={() => setOpen(false)} title="Yeni mezun">
        <form onSubmit={submit}>
          {err && <Alert tone="err">{err}</Alert>}

          <div className="field">
            <label htmlFor="a-fullName">Ad Soyad</label>
            <input
              id="a-fullName"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              placeholder="Ad Soyad"
            />
          </div>

          <div className="field">
            <label htmlFor="a-year">Mezuniyet yılı</label>
            <input
              id="a-year"
              type="number"
              value={form.graduationYear}
              onChange={(e) => set('graduationYear', e.target.value)}
              placeholder="Örn. 2024"
            />
          </div>

          <div className="field">
            <label htmlFor="a-program">Program</label>
            <input
              id="a-program"
              value={form.programName}
              onChange={(e) => set('programName', e.target.value)}
              placeholder="Program adı"
            />
          </div>

          <div className="field">
            <label htmlFor="a-email">E-posta</label>
            <input
              id="a-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="ornek@eposta.com"
            />
          </div>

          <div className="field">
            <label htmlFor="a-employment">Çalıştığı yer</label>
            <input
              id="a-employment"
              value={form.employment}
              onChange={(e) => set('employment', e.target.value)}
              placeholder="İsteğe bağlı"
            />
          </div>

          <div className="row" style={{ gap: 8, marginTop: 12, marginBottom: 0 }}>
            <Button variant="primary" icon="check" type="submit" disabled={busy || !valid}>
              Kaydet
            </Button>
            <Button variant="ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
