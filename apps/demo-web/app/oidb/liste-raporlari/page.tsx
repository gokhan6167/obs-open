'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Alert,
  Skeleton,
  SkeletonStats,
  EmptyState,
  Segmented,
} from '@/app/ui';

// GET /portal/students -> { items: [...], total }
interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string; // API'de e-posta/kimlik olarak döner
  programName: string;
  status: string;
  gpa: number | null;
}

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  kayit_dondurma: 'Kayıt Donduruldu',
  pasif: 'Pasif',
  iliskigi_kesildi: 'İlişiği Kesildi',
  mezun: 'Mezun',
  azami_sure_doldu: 'Azami Süre Doldu',
  af_ogrencisi: 'Af Öğrencisi',
};
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  aktif: 'ok',
  mezun: 'ok',
  kayit_dondurma: 'warn',
  af_ogrencisi: 'warn',
  azami_sure_doldu: 'warn',
  pasif: 'muted',
  iliskigi_kesildi: 'danger',
};
function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'muted' {
  return STATUS_TONE[s] ?? 'muted';
}

type ListType = 'program' | 'durum' | 'riskli' | 'mezun';

const LIST_TYPES: { value: ListType; label: string }[] = [
  { value: 'program', label: 'Program Bazında' },
  { value: 'durum', label: 'Duruma Göre' },
  { value: 'riskli', label: 'GNO < 2.00 (Riskli)' },
  { value: 'mezun', label: 'Mezunlar' },
];

const RISK_THRESHOLD = 2.0;

/** Her liste tipi için satır filtresi. */
function filterRows(type: ListType, rows: StudentRow[]): StudentRow[] {
  switch (type) {
    case 'program':
      // Programa göre sıralı tam liste.
      return [...rows].sort((a, b) => a.programName.localeCompare(b.programName, 'tr'));
    case 'durum':
      // Duruma göre sıralı tam liste.
      return [...rows].sort((a, b) =>
        (STATUS_TR[a.status] ?? a.status).localeCompare(STATUS_TR[b.status] ?? b.status, 'tr'),
      );
    case 'riskli':
      return rows
        .filter((r) => r.gpa != null && r.gpa < RISK_THRESHOLD)
        .sort((a, b) => (a.gpa ?? 0) - (b.gpa ?? 0));
    case 'mezun':
      return rows.filter((r) => r.status === 'mezun');
    default:
      return rows;
  }
}

const CSV_NAME: Record<ListType, string> = {
  program: 'oidb-liste-program-bazinda',
  durum: 'oidb-liste-duruma-gore',
  riskli: 'oidb-liste-gno-riskli',
  mezun: 'oidb-liste-mezunlar',
};
const EMPTY_TEXT: Record<ListType, string> = {
  program: 'Kayıtlı öğrenci bulunamadı.',
  durum: 'Kayıtlı öğrenci bulunamadı.',
  riskli: 'GNO’su 2.00’ın altında öğrenci yok.',
  mezun: 'Mezun durumunda öğrenci yok.',
};

export default function ListeRaporlari(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [type, setType] = useState<ListType>('program');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    // Tek çağrı; sayfa boyutu üst sınır (100) ile çekilip istemcide filtrelenir.
    api<{ items: StudentRow[]; total: number }>('/portal/students?pageSize=100')
      .then((res) => setRows(res.items))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Liste alınamadı'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => filterRows(type, rows), [type, rows]);

  const stats = useMemo(() => {
    const total = rows.length;
    const mezun = rows.filter((r) => r.status === 'mezun').length;
    const riskli = rows.filter((r) => r.gpa != null && r.gpa < RISK_THRESHOLD).length;
    const programlar = new Set(rows.map((r) => r.programName)).size;
    return { total, mezun, riskli, programlar };
  }, [rows]);

  return (
    <>
      <PageHeader
        title="Liste Raporları"
        sub="Kılavuzdaki 12 liste raporunun canlı-veri karşılığı. Liste tipini seçin; öğrenciler ilgili filtreyle listelenir, arama ve CSV dışa aktarım kullanılabilir. Öğrenci listesi en çok 100 kayıtla çekilir."
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam öğrenci', value: stats.total, icon: 'users' },
            { label: 'Program sayısı', value: stats.programlar, icon: 'grid' },
            {
              label: 'GNO < 2.00 (riskli)',
              value: stats.riskli,
              icon: 'alert',
              tone: stats.riskli > 0 ? 'danger' : undefined,
            },
            { label: 'Mezun', value: stats.mezun, icon: 'award' },
          ]}
        />
      )}

      <Card title="Liste Raporu" icon="fileText">
        {err && <Alert tone="err">{err}</Alert>}

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Liste tipi</label>
          <Segmented value={type} onChange={(v) => setType(v as ListType)} options={LIST_TYPES} />
        </div>

        <p className="hint" style={{ marginBottom: 12 }}>
          {filtered.length} kayıt
          {type === 'program' && ' · programa göre sıralı'}
          {type === 'durum' && ' · duruma göre sıralı'}
          {type === 'riskli' && ` · GNO ${RISK_THRESHOLD.toFixed(2)} eşiğinin altında`}
          {type === 'mezun' && ' · yalnızca mezun durumundakiler'}
        </p>

        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<StudentRow>
            rows={filtered}
            search
            csv
            csvName={CSV_NAME[type]}
            empty={<EmptyState icon="fileText" title="Kayıt yok" sub={EMPTY_TEXT[type]} />}
            columns={[
              {
                key: 'studentNo',
                header: 'No',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => <b>{r.studentNo}</b>,
              },
              { key: 'fullName', header: 'Ad', sortable: true, value: (r) => r.fullName },
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
                key: 'gpa',
                header: 'GNO',
                sortable: true,
                num: true,
                value: (r) => (r.gpa != null ? r.gpa : -1),
                render: (r) =>
                  r.gpa != null ? (
                    <Badge tone={r.gpa < RISK_THRESHOLD ? 'danger' : 'ok'}>{r.gpa.toFixed(2)}</Badge>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
