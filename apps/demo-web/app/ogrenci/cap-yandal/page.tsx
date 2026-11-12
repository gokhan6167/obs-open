'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert, EmptyState,
  Skeleton, SkeletonStats, toast, fmtDate,
} from '@/app/ui';

interface Me {
  student?: { id: string; program: { id: string } };
}
interface Program {
  id: string;
  name: string;
}
interface DmApp {
  id: string;
  type: string;
  status: string;
  targetProgram: string;
  gpaSnapshot: number | null;
  decisionReason: string | null;
  createdAt: string;
}
const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  submitted: 'warn',
  in_review: 'warn',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'muted',
};
const TR: Record<string, string> = {
  submitted: 'Başvuruldu',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};

export default function CapYandal(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [apps, setApps] = useState<DmApp[]>([]);
  const [type, setType] = useState<'cap' | 'yandal'>('cap');
  const [target, setTarget] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadApps = useCallback(async () => setApps(await api<DmApp[]>('/portal/double-major')), []);
  useEffect(() => {
    Promise.all([api<Me>('/portal/me'), api<Program[]>('/programs')])
      .then(([m, p]) => {
        setMe(m);
        setPrograms(p);
      })
      .then(loadApps)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [loadApps]);

  async function apply(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!me?.student || !target) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await api('/double-major', {
        method: 'POST',
        body: { studentId: me.student.id, type, targetProgramId: target },
      });
      setMsg('Başvurunuz alındı; GNO ve dönem oranı sunucuda denetlenip komisyona gönderildi.');
      setTarget('');
      await loadApps();
      toast('Başvuru alındı', { tone: 'ok', body: `${type === 'cap' ? 'ÇAP' : 'Yandal'} başvurunuz komisyona iletildi.` });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Başvuru başarısız';
      setErr(m);
      toast('Başvuru başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const others = programs.filter((p) => p.id !== me?.student?.program.id);
  const active = apps.filter((a) => a.status === 'submitted' || a.status === 'in_review').length;

  return (
    <>
      <PageHeader
        title="ÇAP / Yandal"
        sub="Çift anadal / yandal başvurusu oluştur ve durumunu takip et. Uygunluk (GNO + tamamlanan dönem oranı) sunucuda otomatik denetlenir."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam başvuru', value: apps.length, icon: 'layers' },
            { label: 'Beklemede', value: active, icon: 'clock', tone: active > 0 ? 'warn' : undefined },
            { label: 'Onaylı', value: apps.filter((a) => a.status === 'approved').length, icon: 'checkCircle', tone: 'ok' },
          ]}
        />
      )}

      <Card icon="edit" title="Yeni Başvuru" className="reveal">
        {msg && <Alert tone="ok">{msg}</Alert>}
        {err && <Alert tone="err">{err}</Alert>}
        <form onSubmit={apply}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <label>Tür</label>
              <select value={type} onChange={(e) => setType(e.target.value as 'cap' | 'yandal')}>
                <option value="cap">Çift Anadal (ÇAP)</option>
                <option value="yandal">Yandal</option>
              </select>
            </div>
            <div className="field" style={{ flex: '2 1 220px', marginBottom: 0 }}>
              <label>Hedef program</label>
              <select value={target} onChange={(e) => setTarget(e.target.value)} required>
                <option value="">Seçiniz…</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" icon="arrowRight" disabled={busy || !target}>
              {busy ? 'Gönderiliyor…' : 'Başvur'}
            </Button>
          </div>
        </form>
      </Card>

      <Card icon="fileText" title="Başvurularım" className="reveal">
        {loading ? (
          <Skeleton lines={4} />
        ) : apps.length === 0 ? (
          <EmptyState
            icon="layers"
            title="Henüz başvuru yok"
            sub="Yukarıdan hedef program seçerek çift anadal veya yandal başvurusu oluşturabilirsiniz."
          />
        ) : (
          <DataTable
            rows={apps}
            csv
            csvName="cap-yandal-basvurulari"
            empty="Kayıt bulunamadı."
            columns={[
              { key: 'type', header: 'Tür', value: (a) => (a.type === 'cap' ? 'ÇAP' : 'Yandal'), render: (a) => (a.type === 'cap' ? 'ÇAP' : 'Yandal') },
              { key: 'targetProgram', header: 'Hedef Program', value: (a) => a.targetProgram },
              { key: 'createdAt', header: 'Tarih', value: (a) => a.createdAt, render: (a) => fmtDate(a.createdAt) },
              { key: 'gpa', header: 'GNO (anlık)', num: true, value: (a) => a.gpaSnapshot ?? -1, render: (a) => (a.gpaSnapshot != null ? a.gpaSnapshot.toFixed(2) : '—') },
              {
                key: 'status', header: 'Durum', value: (a) => TR[a.status] ?? a.status,
                render: (a) => <Badge tone={BADGE[a.status] ?? 'muted'}>{TR[a.status] ?? a.status}</Badge>,
              },
              { key: 'reason', header: 'Karar', sortable: false, value: (a) => a.decisionReason ?? '', render: (a) => <span className="muted">{a.decisionReason ?? '—'}</span> },
            ]}
          />
        )}
      </Card>
    </>
  );
}
