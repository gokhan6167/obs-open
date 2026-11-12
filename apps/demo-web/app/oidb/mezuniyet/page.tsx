'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Alert,
  Skeleton,
  Drawer,
  EmptyState,
  toast,
} from '@/app/ui';

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | null;
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
interface VerifyResult {
  valid: boolean;
  docType?: string;
  studentNo?: string;
  programName?: string;
  issuedAt?: string;
  revoked?: boolean;
}

const HONOR_TR: Record<string, string> = {
  high_honor: 'Yüksek Onur',
  honor: 'Onur',
  none: '—',
};

export default function Mezuniyet(): React.ReactElement {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [sel, setSel] = useState<StudentRow | null>(null);
  const [status, setStatus] = useState<GradStatus | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [listErr, setListErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Doğrulama aracı (belge üzerindeki kod ile).
  const [code, setCode] = useState('');
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifyErr, setVerifyErr] = useState('');

  const load = useCallback(async () => {
    const res = await api<{ items: StudentRow[] }>('/portal/students');
    setRows(res.items);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setListErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const dist = useMemo(() => {
    const graduated = rows.filter((r) => r.status === 'mezun').length;
    return { total: rows.length, graduated, active: rows.length - graduated };
  }, [rows]);

  async function pick(r: StudentRow): Promise<void> {
    setSel(r);
    setStatus(null);
    setErr('');
    setStatusBusy(true);
    try {
      setStatus(await api<GradStatus>(`/graduation/students/${r.id}/status`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Mezuniyet durumu alınamadı');
    } finally {
      setStatusBusy(false);
    }
  }

  async function approve(): Promise<void> {
    if (!sel) return;
    if (!window.confirm(`${sel.studentNo} mezuniyeti onaylanacak (geri alınamaz). Onaylıyor musunuz?`))
      return;
    setBusy(true);
    setErr('');
    try {
      const res = await api<{ diplomaNo: string; status: string }>(
        `/graduation/students/${sel.id}/approve`,
        { method: 'POST' },
      );
      toast('Mezuniyet onaylandı', { tone: 'ok', body: `Diploma No: ${res.diplomaNo}` });
      await load();
      setSel((s) => (s ? { ...s, status: 'mezun' } : s));
      setStatus(await api<GradStatus>(`/graduation/students/${sel.id}/status`));
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Onay başarısız';
      setErr(m);
      toast('Onay başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function issueTranscript(): Promise<void> {
    if (!sel) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/documents/students/${sel.id}/transcript`, {
        method: 'POST',
        headers: { authorization: `Bearer ${getToken() ?? ''}` },
      });
      if (!res.ok) throw new Error(`Belge üretilemedi (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transkript-${sel.studentNo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Transkript üretildi', {
        tone: 'ok',
        body: 'PDF indirildi. Belge üzerindeki kod ile doğrulanabilir.',
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Belge üretilemedi';
      setErr(m);
      toast('Belge üretilemedi', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function doVerify(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setVerify(null);
    setVerifyErr('');
    try {
      setVerify(await api<VerifyResult>(`/public/verify/${encodeURIComponent(code.trim())}`));
    } catch (er) {
      setVerifyErr(er instanceof Error ? er.message : 'Doğrulama başarısız');
    }
  }

  return (
    <>
      <PageHeader
        title="Mezuniyet & Belge"
        sub="Mezuniyet uygunluğunu kontrol et, onayla, transkript üret ve doğrulama kodunu teyit et."
      />

      <StatGrid
        stats={[
          { label: 'Toplam öğrenci', value: dist.total, icon: 'users' },
          { label: 'Mezun', value: dist.graduated, icon: 'award', tone: 'ok' },
          { label: 'Devam eden', value: dist.active, icon: 'user' },
        ]}
      />

      <Card title="Öğrenciler" icon="users" hint="Mezuniyet durumunu görmek için bir öğrenci seçin.">
        {listErr && <Alert tone="err">{listErr}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<StudentRow>
            rows={rows}
            search
            csv
            csvName="oidb-mezuniyet"
            empty={<EmptyState icon="users" title="Eşleşen öğrenci yok" />}
            columns={[
              {
                key: 'studentNo',
                header: 'No',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => <b>{r.studentNo}</b>,
              },
              { key: 'fullName', header: 'Ad Soyad', sortable: true, value: (r) => r.fullName },
              { key: 'programName', header: 'Program', sortable: true, value: (r) => r.programName },
              {
                key: 'gpa',
                header: 'GNO',
                sortable: true,
                num: true,
                value: (r) => (r.gpa != null ? r.gpa : -1),
                render: (r) => (r.gpa != null ? r.gpa.toFixed(2) : '—'),
              },
              {
                key: 'status',
                header: 'Durum',
                value: (r) => (r.status === 'mezun' ? 'Mezun' : 'Devam'),
                render: (r) =>
                  r.status === 'mezun' ? <Badge tone="ok">Mezun</Badge> : <Badge tone="muted">Devam</Badge>,
              },
              {
                key: 'action',
                header: '',
                render: (r) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => pick(r)}>
                    Seç
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card title="Belge Doğrulama" icon="shield" hint="Üretilen belgenin üzerindeki doğrulama kodunu girin.">
        <form onSubmit={doVerify}>
          <div className="row" style={{ alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '2 1 260px', marginBottom: 0 }}>
              <label>Doğrulama kodu</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Belgedeki kod" />
            </div>
            <Button variant="ghost" icon="search" type="submit" disabled={!code.trim()}>
              Doğrula
            </Button>
          </div>
        </form>
        {verifyErr && (
          <div style={{ marginTop: 10 }}>
            <Alert tone="err">{verifyErr}</Alert>
          </div>
        )}
        {verify && (
          <div style={{ marginTop: 10 }}>
            {verify.valid ? (
              <Alert tone="ok">
                Geçerli belge · {verify.docType} · Öğrenci No {verify.studentNo} · {verify.programName} ·
                Düzenlenme {verify.issuedAt}
              </Alert>
            ) : (
              <Alert tone="err">
                Belge geçersiz{verify.revoked ? ' (iptal edilmiş)' : ' veya bulunamadı'}.
              </Alert>
            )}
          </div>
        )}
      </Card>

      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel ? `Mezuniyet · ${sel.studentNo}` : undefined}
      >
        {sel && (
          <>
            <p className="hint">
              {sel.fullName} · {sel.programName}
            </p>
            {err && <Alert tone="err">{err}</Alert>}
            {statusBusy || !status ? (
              <Skeleton lines={6} />
            ) : (
              <>
                <StatGrid
                  stats={[
                    {
                      label: `GNO ${status.completion.meetsGpa ? '✓' : '✗'}`,
                      value: status.gpa.toFixed(2),
                      icon: 'grade',
                      tone: status.completion.meetsGpa ? 'ok' : 'danger',
                    },
                    {
                      label: `Kazanılan AKTS ${status.completion.meetsEcts ? '✓' : '✗'}`,
                      value: status.earnedEcts,
                      icon: 'award',
                      tone: status.completion.meetsEcts ? 'ok' : 'danger',
                    },
                    {
                      label: 'Eksik zorunlu ders',
                      value: status.completion.missingMandatory.length,
                      icon: 'book',
                      tone: status.completion.missingMandatory.length > 0 ? 'warn' : undefined,
                    },
                    {
                      label: 'Derece',
                      value: HONOR_TR[status.honor] ?? status.honor,
                      icon: 'flag',
                    },
                  ]}
                />

                {status.completion.isComplete ? (
                  <Alert tone="ok">
                    Tüm mezuniyet koşulları sağlanıyor. Öğrenci mezuniyet onayına uygun.
                  </Alert>
                ) : (
                  <Alert tone="warn">
                    <b>Mezuniyet koşulları henüz sağlanmıyor.</b>
                    {status.completion.missingMandatory.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        Eksik zorunlu dersler ({status.completion.missingMandatoryEcts} AKTS):{' '}
                        {status.completion.missingMandatory.join(', ')}
                      </div>
                    )}
                    {!status.completion.meetsGpa && <div>Asgari mezuniyet GNO&apos;su sağlanmıyor.</div>}
                    {!status.completion.meetsEcts && <div>Toplam AKTS eşiği sağlanmıyor.</div>}
                  </Alert>
                )}

                <div className="row" style={{ gap: 8, marginTop: 12, marginBottom: 0, flexWrap: 'wrap' }}>
                  <Button
                    variant="ok"
                    icon="checkCircle"
                    disabled={busy || !status.completion.isComplete || sel.status === 'mezun'}
                    onClick={approve}
                  >
                    {sel.status === 'mezun' ? 'Zaten mezun' : 'Mezuniyeti onayla'}
                  </Button>
                  <Button variant="primary" icon="download" disabled={busy} onClick={issueTranscript}>
                    Transkript üret (PDF)
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
