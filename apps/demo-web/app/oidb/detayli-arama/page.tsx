'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  EmptyState,
  Skeleton,
  SkeletonStats,
  Alert,
  Segmented,
} from '@/app/ui';

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | string | null;
}
interface StudentsResp {
  items: StudentRow[];
  total: number;
}

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  kayit_dondurma: 'Kayıt Dondurma',
  pasif: 'Pasif',
  iliskigi_kesildi: 'İlişiği Kesildi',
  mezun: 'Mezun',
  azami_sure_doldu: 'Azami Süre Doldu',
  af_ogrencisi: 'Af Öğrencisi',
};
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  aktif: 'ok',
  mezun: 'muted',
  kayit_dondurma: 'warn',
  pasif: 'muted',
  iliskigi_kesildi: 'danger',
  azami_sure_doldu: 'danger',
  af_ogrencisi: 'warn',
};

// Durum Segmented: hepsi / aktif / mezun / ilişik (spec).
type StatusKey = '' | 'aktif' | 'mezun' | 'iliskigi_kesildi';
const STATUS_FILTERS: { value: StatusKey; label: string }[] = [
  { value: '', label: 'Hepsi' },
  { value: 'aktif', label: 'Aktif' },
  { value: 'mezun', label: 'Mezun' },
  { value: 'iliskigi_kesildi', label: 'İlişiği Kesildi' },
];

const gpaText = (v: number | string | null | undefined): string => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n == null || Number.isNaN(n) ? '—' : n.toFixed(2);
};
const gpaNum = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n == null || Number.isNaN(n) ? -1 : n;
};

export default function DetayliArama(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusKey>('');
  const [program, setProgram] = useState('');
  const [page, setPage] = useState(1);

  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const first = useRef(true);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    p.set('page', String(page));
    const qs = p.toString();
    const res = await api<StudentsResp>(`/portal/students${qs ? `?${qs}` : ''}`);
    setRows(res.items);
    setTotal(res.total ?? res.items.length);
  }, [q, status, page]);

  // Sunucu-taraflı q/status/page için debounce'lu yeniden yükleme.
  useEffect(() => {
    const t = setTimeout(
      () => {
        setErr('');
        setLoading(true);
        load()
          .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
          .finally(() => setLoading(false));
      },
      first.current ? 0 : 300,
    );
    first.current = false;
    return () => clearTimeout(t);
  }, [load]);

  // Durum veya arama değişince ilk sayfaya dön.
  useEffect(() => {
    setPage(1);
  }, [q, status]);

  // Program filtresi seçenekleri yüklü satırlardan türetilir (yalnızca verilen uçlar).
  const programs = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.programName).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'tr'),
      ),
    [rows],
  );

  const filtered = useMemo(
    () => (program ? rows.filter((r) => r.programName === program) : rows),
    [rows, program],
  );

  const activeCount = useMemo(() => rows.filter((r) => r.status === 'aktif').length, [rows]);

  return (
    <>
      <PageHeader
        title="Detaylı Öğrenci Arama"
        sub="Ad, öğrenci numarası veya program adıyla arayın; durum ve programa göre süzün. Sonuçları CSV olarak dışa aktarabilirsiniz. Arama ve durum filtresi sunucu tarafında uygulanır."
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam Öğrenci', value: total, icon: 'users' },
            { label: 'Bu Sayfada Aktif', value: activeCount, icon: 'checkCircle', tone: 'ok' },
            { label: 'Eşleşen Sonuç', value: filtered.length, icon: 'search' },
          ]}
        />
      )}

      <Card
        title="Arama & Filtre"
        icon="search"
        hint="Ad, numara veya program adına göre arayın; durum ve programa göre süzün. Sonuç tablosunu CSV olarak indirin."
      >
        <div className="field">
          <label>Ara</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ad, öğrenci numarası veya program"
          />
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Durum</label>
          <Segmented
            value={status}
            onChange={(v) => setStatus(v as StatusKey)}
            options={STATUS_FILTERS}
          />
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Program</label>
          <select value={program} onChange={(e) => setProgram(e.target.value)}>
            <option value="">Tüm programlar</option>
            {programs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<StudentRow>
            rows={filtered}
            search={false}
            csv
            csvName="detayli-ogrenci-arama"
            pageSize={25}
            empty={
              <EmptyState
                icon="users"
                title="Eşleşen öğrenci bulunamadı"
                sub="Arama terimini, durum veya program filtresini gevşetin."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'No',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => <b>{r.studentNo}</b>,
              },
              { key: 'fullName', header: 'Ad', sortable: true, value: (r) => r.fullName },
              { key: 'programName', header: 'Program', sortable: true, value: (r) => r.programName },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={STATUS_TONE[r.status] ?? 'muted'}>
                    {STATUS_TR[r.status] ?? r.status}
                  </Badge>
                ),
              },
              {
                key: 'gpa',
                header: 'GNO',
                sortable: true,
                num: true,
                value: (r) => gpaNum(r.gpa),
                render: (r) => gpaText(r.gpa),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
