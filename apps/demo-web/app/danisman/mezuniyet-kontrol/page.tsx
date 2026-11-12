'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonStats,
  ProgressBar,
  Icon,
} from '@/app/ui';
import { api } from '@/lib/api';

interface Student {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | null;
}
interface StudentList {
  items: Student[];
}
interface Completion {
  missingMandatory: string[];
  missingMandatoryEcts: number;
  meetsGpa: boolean;
  meetsEcts: boolean;
  isComplete: boolean;
}
interface GradStatus {
  completion: Completion;
  gpa: number;
  earnedEcts: number;
  honor: string;
}

const HONOR_TR: Record<string, string> = {
  yuksek_onur: 'Yüksek Onur',
  onur: 'Onur',
  yok: '—',
};

/** Bir öğrencinin mezuniyet uzaklığını 0-3 skala ile özetler (kohort sıralaması için). */
function readinessRank(g: GradStatus | null): number {
  if (!g) return 4;
  if (g.completion.isComplete) return 0;
  const failedConds =
    (g.completion.meetsGpa ? 0 : 1) +
    (g.completion.meetsEcts ? 0 : 1) +
    (g.completion.missingMandatory.length > 0 ? 1 : 0);
  return failedConds;
}

function CheckRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}): React.ReactElement {
  return (
    <div
      className="list-item"
      style={{ borderLeft: `4px solid ${ok ? 'var(--ok)' : 'var(--danger)'}`, paddingLeft: 10 }}
    >
      <Badge tone={ok ? 'ok' : 'danger'}>{ok ? 'Tamam' : 'Eksik'}</Badge> {label}
      <div className="meta">{detail}</div>
    </div>
  );
}

export default function MezuniyetKontrolPage(): React.ReactElement {
  const [list, setList] = useState<Student[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Student | null>(null);
  const [status, setStatus] = useState<GradStatus | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  // Kohort taraması (opsiyonel, on-demand): tüm danışanların mezuniyet hazırlık durumu.
  const [scan, setScan] = useState<Record<string, GradStatus | null>>({});
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  useEffect(() => {
    api<StudentList>('/portal/students')
      .then((r) => setList(r.items))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  function inspect(s: Student): void {
    setSelected(s);
    setStatus(null);
    setStatusErr('');
    setStatusLoading(true);
    api<GradStatus>(`/graduation/students/${s.id}/status`)
      .then(setStatus)
      .catch((e) => setStatusErr(e instanceof Error ? e.message : 'Mezuniyet durumu alınamadı'))
      .finally(() => setStatusLoading(false));
  }

  async function runCohortScan(): Promise<void> {
    setScanning(true);
    setScanDone(false);
    setScanProgress(0);
    const next: Record<string, GradStatus | null> = {};
    let done = 0;
    // Sıralı tara (API'yi boğmamak için) — tamamlandıkça ilerleme yansır.
    for (const s of list) {
      try {
        next[s.id] = await api<GradStatus>(`/graduation/students/${s.id}/status`);
      } catch {
        next[s.id] = null;
      }
      done += 1;
      setScanProgress(Math.round((done / list.length) * 100));
      setScan({ ...next });
    }
    setScanning(false);
    setScanDone(true);
  }

  const sortedList = useMemo(() => {
    if (!scanDone) return [...list].sort((a, b) => a.studentNo.localeCompare(b.studentNo, 'tr'));
    // Tarama bittiyse mezuniyete en yakınlar üste.
    return [...list].sort(
      (a, b) => readinessRank(scan[a.id] ?? null) - readinessRank(scan[b.id] ?? null),
    );
  }, [list, scan, scanDone]);

  const cohortStats = useMemo(() => {
    if (!scanDone) return null;
    const vals = list.map((s) => scan[s.id] ?? null);
    return {
      ready: vals.filter((g) => g?.completion.isComplete).length,
      oneStep: vals.filter((g) => g && !g.completion.isComplete && readinessRank(g) === 1).length,
      far: vals.filter((g) => g && !g.completion.isComplete && readinessRank(g) >= 2).length,
    };
  }, [list, scan, scanDone]);

  return (
    <>
      <PageHeader
        title="Mezuniyet Ön Kontrol"
        sub="Danışan öğrenci seçin; eksik zorunlu ders, AKTS ve GNO koşulları kırmızı-yeşil kontrol listesiyle görünür. Kohort taraması ile mezuniyete en yakın öğrencileri üste çekin. Kesin onay ÖİDB tarafından verilir."
        actions={
          <Button
            variant="primary"
            icon="refresh"
            disabled={scanning || loading || list.length === 0}
            onClick={runCohortScan}
          >
            {scanning ? `Taranıyor %${scanProgress}` : scanDone ? 'Yeniden tara' : 'Kohortu tara'}
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Danışan öğrenci', value: list.length, icon: 'users' },
            {
              label: 'Mezuniyete hazır',
              value: cohortStats ? cohortStats.ready : '—',
              icon: 'checkCircle',
              tone: cohortStats && cohortStats.ready > 0 ? 'ok' : undefined,
            },
            {
              label: 'Tek koşul kaldı',
              value: cohortStats ? cohortStats.oneStep : '—',
              icon: 'clock',
              tone: cohortStats && cohortStats.oneStep > 0 ? 'warn' : undefined,
            },
            {
              label: 'Birden çok eksik',
              value: cohortStats ? cohortStats.far : '—',
              icon: 'flag',
            },
          ]}
        />
      )}

      {scanning && (
        <Card title="Kohort Taraması" icon="activity" hint={`%${scanProgress} tamamlandı`}>
          <ProgressBar value={scanProgress} />
        </Card>
      )}
      {!scanning && (
        <p className="hint" style={{ marginTop: -4 }}>
          {scanDone
            ? 'Kohort tarandı — liste mezuniyete yakınlığa göre sıralı.'
            : 'Kohort özeti için tarama çalıştırın (öğrenci başına 1 mezuniyet sorgusu).'}
        </p>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card title="Öğrenciler" icon="users">
          {loading ? (
            <Skeleton lines={6} />
          ) : list.length === 0 ? (
            <EmptyState icon="users" title="Öğrenci bulunamadı" />
          ) : (
            <DataTable
              rows={sortedList}
              search
              csv
              csvName="mezuniyet-kohort"
              pageSize={20}
              columns={[
                {
                  key: 'studentNo',
                  header: 'No',
                  sortable: true,
                  value: (s) => s.studentNo,
                  render: (s) => (
                    <span
                      style={{ cursor: 'pointer', fontWeight: selected?.id === s.id ? 700 : 600 }}
                      onClick={() => inspect(s)}
                    >
                      {s.studentNo}
                    </span>
                  ),
                },
                {
                  key: 'fullName',
                  header: 'Ad',
                  sortable: true,
                  value: (s) => s.fullName,
                  render: (s) => (
                    <span style={{ cursor: 'pointer' }} onClick={() => inspect(s)}>
                      {s.fullName}
                    </span>
                  ),
                },
                {
                  key: 'gpa',
                  header: 'GNO',
                  num: true,
                  sortable: true,
                  value: (s) => (s.gpa === null ? -1 : s.gpa),
                  render: (s) => (s.gpa === null ? '—' : s.gpa.toFixed(2)),
                },
                {
                  key: 'durum',
                  header: 'Durum',
                  value: (s) => {
                    const g = scan[s.id] ?? null;
                    if (!scanDone || !g) return '';
                    return g.completion.isComplete ? 'Hazır' : `${readinessRank(g)} eksik`;
                  },
                  render: (s) => {
                    const g = scan[s.id] ?? null;
                    if (!scanDone) return <span className="muted">—</span>;
                    if (g === null) return <Badge tone="muted">—</Badge>;
                    if (g.completion.isComplete) return <Badge tone="ok">Hazır</Badge>;
                    return readinessRank(g) === 1 ? (
                      <Badge tone="warn">1 eksik</Badge>
                    ) : (
                      <Badge tone="danger">{readinessRank(g)} eksik</Badge>
                    );
                  },
                },
                {
                  key: 'aksiyon',
                  header: '',
                  render: (s) => (
                    <Button variant="ghost" sm icon="eye" onClick={() => inspect(s)}>
                      İncele
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Card>

        <Card title="Mezuniyet Uygunluğu" icon="award">
          {!selected ? (
            <EmptyState icon="award" title="Öğrenci seçilmedi" sub="Soldan bir öğrenci seçin." />
          ) : (
            <>
              <p className="hint">
                {selected.studentNo} · {selected.fullName} · {selected.programName}
              </p>
              {statusErr && <Alert tone="err">{statusErr}</Alert>}
              {statusLoading ? (
                <Skeleton lines={5} />
              ) : status ? (
                <>
                  <Alert tone={status.completion.isComplete ? 'ok' : 'err'}>
                    {status.completion.isComplete
                      ? 'Tüm mezuniyet koşulları sağlanıyor — ÖİDB onayına hazır.'
                      : 'Mezuniyet koşulları henüz tamamlanmadı.'}
                  </Alert>

                  <StatGrid
                    stats={[
                      {
                        label: 'GNO',
                        value: status.gpa.toFixed(2),
                        icon: 'chart',
                        tone: status.completion.meetsGpa ? undefined : 'danger',
                      },
                      {
                        label: 'Kazanılan AKTS',
                        value: status.earnedEcts,
                        icon: 'award',
                        tone: status.completion.meetsEcts ? undefined : 'danger',
                      },
                      {
                        label: 'Onur durumu',
                        value: HONOR_TR[status.honor] ?? status.honor,
                        icon: 'award',
                      },
                    ]}
                  />

                  <div className="list" style={{ marginTop: 12 }}>
                    <CheckRow
                      ok={status.completion.meetsGpa}
                      label="GNO koşulu"
                      detail={`Güncel GNO ${status.gpa.toFixed(2)}`}
                    />
                    <CheckRow
                      ok={status.completion.meetsEcts}
                      label="Toplam AKTS koşulu"
                      detail={`Kazanılan ${status.earnedEcts} AKTS`}
                    />
                    <CheckRow
                      ok={status.completion.missingMandatory.length === 0}
                      label="Zorunlu dersler"
                      detail={
                        status.completion.missingMandatory.length === 0
                          ? 'Tüm zorunlu dersler tamamlandı'
                          : `${status.completion.missingMandatory.length} eksik ders · ${status.completion.missingMandatoryEcts} AKTS`
                      }
                    />
                  </div>

                  {status.completion.missingMandatory.length > 0 && (
                    <div className="card" style={{ marginTop: 12 }}>
                      <h2>Eksik Zorunlu Dersler</h2>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {status.completion.missingMandatory.map((c) => (
                          <Badge key={c} tone="danger">
                            {c}
                          </Badge>
                        ))}
                      </div>
                      <p className="hint" style={{ marginTop: 8 }}>
                        Öğrenciyi bu dersleri açık dönemde seçmesi için yönlendirin; toplam{' '}
                        {status.completion.missingMandatoryEcts} AKTS.
                      </p>
                    </div>
                  )}

                  <div className="row" style={{ gap: 8, marginTop: 12 }}>
                    <a className="btn ghost sm" href={`/danisman/ogrenci?id=${selected.id}`}>
                      <Icon name="user" size={14} /> Öğrenci 360 / Transkript
                    </a>
                  </div>
                </>
              ) : null}
            </>
          )}
        </Card>
      </div>

      <div className="info-box">
        Bu ekran ön kontrol amaçlıdır: mezuniyet motoru güncel not + müfredat üzerinden hesaplar.
        Kesin mezuniyet onayı, diploma numarası ataması ve durum değişikliği yalnızca ÖİDB
        tarafından yapılır.
      </div>
    </>
  );
}
