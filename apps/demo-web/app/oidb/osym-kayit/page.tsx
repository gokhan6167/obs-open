'use client';
import { useEffect, useMemo, useState } from 'react';
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
  toast,
} from '@/app/ui';

type ApplicantStatus = 'basvurdu' | 'kazandi' | 'kazanamadi' | 'kesin_kayit';

interface Program {
  id: string;
  name: string;
  faculty?: string;
  quota?: number;
}
interface Applicant {
  id: string;
  applicationProgramId: string;
  fullName: string;
  osymNo?: string;
  placementScore?: number | null;
  status: ApplicantStatus;
}

const STATUS_TR: Record<ApplicantStatus, string> = {
  basvurdu: 'Başvurdu',
  kazandi: 'Kazandı',
  kazanamadi: 'Kazanamadı',
  kesin_kayit: 'Kesin kayıt',
};

function statusTone(s: ApplicantStatus): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (s === 'kesin_kayit') return 'ok';
  if (s === 'kazandi') return 'info';
  if (s === 'kazanamadi') return 'danger';
  return 'muted';
}

export default function OsymKayit(): React.ReactElement {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsErr, setProgramsErr] = useState('');
  const [programsLoading, setProgramsLoading] = useState(true);

  const [programId, setProgramId] = useState('');

  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [applicantsErr, setApplicantsErr] = useState('');
  const [applicantsLoading, setApplicantsLoading] = useState(false);

  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    api<{ items: Program[] }>('/admissions/programs')
      .then((d) => {
        setPrograms(d.items);
        if (d.items.length > 0) setProgramId(d.items[0].id);
      })
      .catch((e) => setProgramsErr(e instanceof Error ? e.message : 'Programlar yüklenemedi'))
      .finally(() => setProgramsLoading(false));
  }, []);

  useEffect(() => {
    if (!programId) return;
    setApplicantsLoading(true);
    setApplicantsErr('');
    api<{ items: Applicant[] }>(`/admissions/applicants?applicationProgramId=${encodeURIComponent(programId)}`)
      .then((d) => setApplicants(d.items))
      .catch((e) => setApplicantsErr(e instanceof Error ? e.message : 'Adaylar yüklenemedi'))
      .finally(() => setApplicantsLoading(false));
  }, [programId]);

  const programOptions = useMemo(
    () => programs.map((p) => ({ value: p.id, label: p.name })),
    [programs],
  );

  const stats = useMemo(() => {
    const total = applicants.length;
    const kesin = applicants.filter((a) => a.status === 'kesin_kayit').length;
    const kazandi = applicants.filter((a) => a.status === 'kazandi').length;
    return [
      { label: 'Kazanan aday', value: String(total) },
      { label: 'Kesin kayıt', value: String(kesin) },
      { label: 'Kayıt bekleyen', value: String(kazandi) },
    ];
  }, [applicants]);

  async function register(a: Applicant): Promise<void> {
    setBusy((prev) => new Set(prev).add(a.id));
    try {
      await api<Applicant>(`/admissions/applicants/${a.id}`, {
        method: 'PATCH',
        body: { status: 'kesin_kayit' },
      });
      setApplicants((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, status: 'kesin_kayit' } : x)),
      );
      toast('Kesin kayıt tamamlandı', {
        tone: 'ok',
        body: `${a.fullName} için kesin kayıt yapıldı.`,
      });
    } catch (e) {
      toast('Kesin kayıt yapılamadı', {
        tone: 'err',
        body: e instanceof Error ? e.message : 'Bilinmeyen hata',
      });
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(a.id);
        return next;
      });
    }
  }

  return (
    <>
      <PageHeader
        title="ÖSYM Kesin Kayıt"
        sub="Başvuru programı seçin, yerleşen adayları görüntüleyin ve kesin kaydını tamamlayın."
      />

      <Alert tone="info">
        Kesin kayıt sırasında e-Devlet üzerinden kimlik ve mezuniyet bilgileri aktarılır, yüklenen
        belgeler kontrol edilir. Bu ortamda aktarım ve belge kontrolü örnek (mock) olarak
        işletilmektedir.
      </Alert>

      <Card title="Başvuru programı" icon="folder">
        {programsLoading ? (
          <Skeleton lines={2} />
        ) : programsErr ? (
          <Alert tone="err">{programsErr}</Alert>
        ) : programs.length === 0 ? (
          <EmptyState title="Program bulunamadı" sub="Tanımlı başvuru programı yok." />
        ) : (
          <Segmented value={programId} onChange={setProgramId} options={programOptions} />
        )}
      </Card>

      {programId &&
        (applicantsLoading ? (
          <SkeletonStats n={3} />
        ) : (
          <StatGrid stats={stats} />
        ))}

      <Card title="Yerleşen adaylar" icon="users">
        {!programId ? (
          <EmptyState title="Program seçin" sub="Adayları görmek için bir başvuru programı seçin." />
        ) : applicantsLoading ? (
          <Skeleton lines={6} />
        ) : applicantsErr ? (
          <Alert tone="err">{applicantsErr}</Alert>
        ) : (
          <DataTable<Applicant>
            rows={applicants}
            csv
            csvName="osym-adaylar"
            empty={<EmptyState title="Aday bulunamadı" sub="Bu program için yerleşen aday yok." />}
            columns={[
              {
                key: 'fullName',
                header: 'Ad Soyad',
                value: (r) => r.fullName,
                render: (r) => r.fullName,
              },
              {
                key: 'osymNo',
                header: 'ÖSYM No',
                value: (r) => r.osymNo ?? '',
                render: (r) => r.osymNo ?? '—',
              },
              {
                key: 'placementScore',
                header: 'Yerleştirme Puanı',
                num: true,
                value: (r) => r.placementScore ?? 0,
                render: (r) =>
                  r.placementScore != null ? r.placementScore.toFixed(3) : '—',
              },
              {
                key: 'status',
                header: 'Durum',
                value: (r) => STATUS_TR[r.status],
                render: (r) => <Badge tone={statusTone(r.status)}>{STATUS_TR[r.status]}</Badge>,
              },
              {
                key: 'action',
                header: 'İşlem',
                render: (r) =>
                  r.status === 'kesin_kayit' ? (
                    <Badge tone="ok" noDot>
                      Kayıtlı
                    </Badge>
                  ) : (
                    <Button
                      variant="ok"
                      sm
                      icon="check"
                      disabled={r.status !== 'kazandi' || busy.has(r.id)}
                      onClick={() => register(r)}
                    >
                      {busy.has(r.id) ? 'İşleniyor…' : 'Kesin kayıt'}
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
