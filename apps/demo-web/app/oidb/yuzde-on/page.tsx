'use client';
import { useEffect, useMemo, useState } from 'react';
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
} from '@/app/ui';

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  gpa: number | string | null;
}
interface StudentsResp {
  items: StudentRow[];
  total: number;
}

const gpaText = (v: number | string | null | undefined): string => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n == null || Number.isNaN(n) ? '—' : n.toFixed(2);
};
const gpaNum = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n == null || Number.isNaN(n) ? -1 : n;
};

export default function YuzdeOn(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [program, setProgram] = useState('');

  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setErr('');
    setLoading(true);
    api<StudentsResp>('/portal/students?pageSize=100')
      .then((res) => {
        setRows(res.items);
        setTotal(res.total ?? res.items.length);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  // Program filtresi seçenekleri yüklü satırlardan türetilir (yalnızca verilen uçlar).
  const programs = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.programName).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'tr'),
      ),
    [rows],
  );

  // Program filtresi (opsiyonel) uygulanmış aday havuzu.
  const pool = useMemo(
    () => (program ? rows.filter((r) => r.programName === program) : rows),
    [rows, program],
  );

  // GNO'ya göre azalan sırala; en yüksek %10'u (Math.ceil(n*0.1)) seç.
  const topTen = useMemo(() => {
    const sorted = [...pool].sort((a, b) => gpaNum(b.gpa) - gpaNum(a.gpa));
    const n = sorted.length;
    const cut = n > 0 ? Math.ceil(n * 0.1) : 0;
    return sorted.slice(0, cut);
  }, [pool]);

  const cutGpa = topTen.length > 0 ? gpaNum(topTen[topTen.length - 1].gpa) : null;

  return (
    <>
      <PageHeader
        title="%10'a Giren Öğrenci Tespiti"
        sub="Bu liste, öğrencilerin GNO değerlerine göre azalan sıralanıp en yüksek %10'unu (Math.ceil(n×0,1)) gösteren hızlı bir tespittir. Bina/program bazında yönetmeliğe uygun gerçek hesap OİDB motorunda yapılır."
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam Öğrenci', value: total, icon: 'users' },
            { label: 'Aday Havuzu', value: pool.length, icon: 'filter' },
            {
              label: "%10'a Giren",
              value: topTen.length,
              icon: 'award',
              tone: 'ok',
            },
          ]}
        />
      )}

      <Card
        title="%10 Listesi"
        icon="award"
        hint="GNO bazlı hızlı tespit. Programa göre süzebilir, listeyi CSV olarak indirebilirsiniz."
        actions={
          cutGpa != null && cutGpa >= 0 ? (
            <Badge tone="info" noDot>
              Eşik GNO: {cutGpa.toFixed(2)}
            </Badge>
          ) : undefined
        }
      >
        <div className="field">
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
            rows={topTen}
            search
            csv
            csvName="yuzde-on-listesi"
            pageSize={25}
            empty={
              <EmptyState
                icon="award"
                title="Listelenecek öğrenci yok"
                sub="Seçili program için GNO'su hesaplanmış öğrenci bulunamadı."
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
