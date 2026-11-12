'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert, EmptyState,
  Skeleton, toast, fmtDate,
} from '@/app/ui';

interface Me {
  student?: { id: string };
}
interface Program {
  code: string;
  name: string;
  level: string;
}
interface Win {
  type: string;
  startsAt?: string;
  endsAt?: string;
}
interface Req {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  decisionReason: string | null;
  createdAt: string;
}

// Gerçek yazma yapan hizmet başvuruları: /requests (type=diger + subtype).
const SERVICE: Record<
  string,
  { title: string; sub: string; subtype: string; desc: string; placeholder: string }
> = {
  randevu: {
    title: 'Randevu Al',
    sub: 'Danışman / öğrenci işleri / birim görüşme randevusu.',
    subtype: 'randevu',
    desc: 'Görüşmek istediğiniz birim ve tercih ettiğiniz zaman aralığını yazın; talebiniz ilgili personelin kuyruğuna düşer.',
    placeholder: 'Örn: Danışmanımla ders kaydı için, önümüzdeki hafta öğleden sonra…',
  },
  pdr: {
    title: 'PDR (Psikolojik Danışma) Başvurusu',
    sub: 'Psikolojik danışmanlık ve rehberlik hizmeti — gizli.',
    subtype: 'pdr',
    desc: 'Başvurunuz yalnızca PDR birimi tarafından görülür. Kısaca görüşme talebinizi belirtebilirsiniz (detay zorunlu değildir).',
    placeholder: 'Görüşme talebi / iletişim tercihiniz…',
  },
  anket: {
    title: 'Anket / Geri Bildirim',
    sub: 'Ders değerlendirme ve memnuniyet geri bildirimi.',
    subtype: 'anket',
    desc: 'Ders/hizmet hakkındaki geri bildiriminizi iletin. Yanıtlarınız kalite süreçlerinde kullanılır.',
    placeholder: 'Geri bildiriminiz…',
  },
  kulup: {
    title: 'Kulüp Başvurusu',
    sub: 'Kulübe üyelik veya yeni kulüp kurma başvurusu.',
    subtype: 'kulup',
    desc: 'Üye olmak istediğiniz kulübü ya da kurmak istediğiniz kulübün amacını yazın; SKS Daire Başkanlığı onayına düşer.',
    placeholder: 'Kulüp adı / başvuru amacı…',
  },
  mesajlar: {
    title: 'Mesajlar',
    sub: 'Birimlere yapılandırılmış mesaj / talep.',
    subtype: 'mesaj',
    desc: 'İlgili birime iletmek istediğiniz konuyu yazın. Serbest mesajlaşma yerine izlenebilir talep akışı kullanılır.',
    placeholder: 'Mesajınız / talebiniz…',
  },
  'staj-kilavuzu': {
    title: 'Staj Başvurusu / Kılavuz',
    sub: 'Staj süreci başvurusu ve bilgi talebi.',
    subtype: 'staj',
    desc: 'Staj yeri, tarih aralığı ve talebinizi yazın; program staj koordinatörlüğüne iletilir.',
    placeholder: 'Staj yeri / tarih / talep detayı…',
  },
  hazirlik: {
    title: 'Hazırlık / Yaz Okulu Kaydı',
    sub: 'Hazırlık yeterlik ve yaz okulu kayıt talebi.',
    subtype: 'hazirlik',
    desc: 'Yaz okulu kayıt talebinizi veya hazırlık yeterlik durumu sorunuzu iletin.',
    placeholder: 'Talep detayı…',
  },
};

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

export default function BilgiSayfasi(): React.ReactElement {
  const params = useParams();
  const konu = String(params.konu);

  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [windows, setWindows] = useState<Win[] | null>(null);
  const [err, setErr] = useState('');

  // Hizmet başvurusu state'i.
  const svc = SERVICE[konu];
  const [studentId, setStudentId] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<Req[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSvc = useCallback(async () => {
    if (!svc) return;
    const [m, reqs] = await Promise.all([
      api<Me>('/portal/me'),
      api<Req[]>('/portal/requests'),
    ]);
    setStudentId(m.student?.id ?? '');
    setItems(reqs.filter((r) => r.type === 'diger' && r.payload?.subtype === svc.subtype));
  }, [svc]);

  useEffect(() => {
    setErr('');
    setMsg('');
    if (konu === 'genel-ders-programi') {
      api<Program[]>('/programs')
        .then(setPrograms)
        .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
    } else if (konu === 'sinav-programi') {
      api<{ id: string }>('/calendar/active-term')
        .then((t) => api<Win[]>(`/calendar/terms/${t.id}/windows`))
        .then(setWindows)
        .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
    } else if (svc) {
      loadSvc().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
    }
  }, [konu, svc, loadSvc]);

  // === Genel ders programı: tüm programlar ===
  if (konu === 'genel-ders-programi') {
    return (
      <>
        <PageHeader title="Genel Ders Programı" sub="Üniversitedeki tüm programlar." />
        {err && <Alert tone="err">{err}</Alert>}
        {programs && (
          <StatGrid
            stats={[
              { label: 'Program', value: programs.length, icon: 'layers' },
              { label: 'Düzey türü', value: new Set(programs.map((p) => p.level)).size, icon: 'grid' },
            ]}
          />
        )}
        <Card icon="building" title="Programlar" className="reveal">
          {!programs ? (
            <Skeleton lines={5} />
          ) : programs.length === 0 ? (
            <EmptyState icon="building" title="Program bulunamadı" />
          ) : (
            <DataTable
              rows={programs}
              csv
              csvName="programlar"
              empty="Eşleşen program yok."
              columns={[
                { key: 'code', header: 'Kod', value: (p) => p.code, render: (p) => <b>{p.code}</b> },
                { key: 'name', header: 'Program', value: (p) => p.name },
                { key: 'level', header: 'Düzey', value: (p) => p.level, render: (p) => <Badge tone="muted">{p.level}</Badge> },
              ]}
            />
          )}
        </Card>
      </>
    );
  }

  // === Sınav / akademik takvim pencereleri ===
  if (konu === 'sinav-programi') {
    const now = Date.now();
    const statusOf = (w: Win): { tone: 'ok' | 'warn' | 'muted'; label: string } => {
      const s = w.startsAt ? Date.parse(w.startsAt) : NaN;
      const e = w.endsAt ? Date.parse(w.endsAt) : NaN;
      const openNow = Number.isFinite(s) && Number.isFinite(e) && now >= s && now <= e;
      const upcoming = Number.isFinite(s) && now < s;
      return openNow ? { tone: 'ok', label: 'Açık' } : upcoming ? { tone: 'warn', label: 'Yaklaşıyor' } : { tone: 'muted', label: 'Kapandı' };
    };
    return (
      <>
        <PageHeader title="Akademik Takvim / Sınav Programı" sub="Aktif dönemin işlem ve sınav pencereleri." />
        {err && <Alert tone="err">{err}</Alert>}
        <Card icon="calendar" title="Pencereler" className="reveal">
          {!windows ? (
            <Skeleton lines={5} />
          ) : windows.length === 0 ? (
            <EmptyState icon="calendar" title="Tanımlı pencere yok" sub="Aktif dönem için henüz işlem penceresi tanımlanmamış." />
          ) : (
            <DataTable
              rows={windows}
              search={false}
              empty="Kayıt bulunamadı."
              columns={[
                { key: 'type', header: 'Tür', value: (w) => w.type, render: (w) => <b>{w.type}</b> },
                { key: 'startsAt', header: 'Başlangıç', value: (w) => w.startsAt ?? '', render: (w) => (w.startsAt ? new Date(w.startsAt).toLocaleString('tr-TR') : '—') },
                { key: 'endsAt', header: 'Bitiş', value: (w) => w.endsAt ?? '', render: (w) => (w.endsAt ? new Date(w.endsAt).toLocaleString('tr-TR') : '—') },
                {
                  key: 'status', header: 'Durum', sortable: false, value: (w) => statusOf(w).label,
                  render: (w) => { const s = statusOf(w); return <Badge tone={s.tone}>{s.label}</Badge>; },
                },
              ]}
            />
          )}
        </Card>
      </>
    );
  }

  // === Gerçek yazma yapan hizmet başvuruları ===
  if (svc) {
    const open = items.filter(
      (r) => r.status === 'submitted' || r.status === 'in_review',
    ).length;

    async function submit(e: React.FormEvent): Promise<void> {
      e.preventDefault();
      if (!studentId || !note.trim() || !svc) return;
      setBusy(true);
      setMsg('');
      setErr('');
      try {
        await api('/requests', {
          method: 'POST',
          body: {
            studentId,
            type: 'diger',
            payload: { subtype: svc.subtype, aciklama: note.trim() },
          },
        });
        setMsg('Başvurunuz alındı ve ilgili birimin kuyruğuna düştü.');
        setNote('');
        await loadSvc();
        toast('Başvuru alındı', { tone: 'ok', body: `${svc.title} ilgili birime iletildi.` });
      } catch (e) {
        const m = e instanceof Error ? e.message : 'Başvuru gönderilemedi';
        setErr(m);
        toast('Başvuru gönderilemedi', { tone: 'err', body: m });
      } finally {
        setBusy(false);
      }
    }

    return (
      <>
        <PageHeader title={svc.title} sub={svc.sub} />

        <StatGrid
          stats={[
            { label: 'Toplam başvuru', value: items.length, icon: 'inbox' },
            { label: 'Beklemede', value: open, icon: 'clock', tone: open > 0 ? 'warn' : undefined },
            { label: 'Sonuçlanan (onay)', value: items.filter((r) => r.status === 'approved').length, icon: 'checkCircle', tone: 'ok' },
          ]}
        />

        <Card icon="edit" title="Yeni Başvuru" hint={svc.desc} className="reveal">
          {msg && <Alert tone="ok">{msg}</Alert>}
          {err && <Alert tone="err">{err}</Alert>}
          <form onSubmit={submit}>
            <div className="field">
              <label>Açıklama</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                required
                placeholder={svc.placeholder}
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--line)',
                  borderRadius: 9,
                  fontFamily: 'inherit',
                  fontSize: 14,
                }}
              />
            </div>
            <Button type="submit" icon="arrowRight" disabled={busy || !studentId || !note.trim()}>
              {busy ? 'Gönderiliyor…' : 'Başvur'}
            </Button>
          </form>
        </Card>

        <Card icon="fileText" title="Başvurularım" className="reveal">
          {items.length === 0 ? (
            <EmptyState icon="inbox" title="Bu türde başvuru yok" sub="Yukarıdaki formu doldurarak başvuru oluşturabilirsiniz." />
          ) : (
            <DataTable
              rows={items}
              search={false}
              empty="Kayıt bulunamadı."
              columns={[
                { key: 'createdAt', header: 'Tarih', value: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
                { key: 'aciklama', header: 'Açıklama', sortable: false, value: (r) => String(r.payload?.aciklama ?? ''), render: (r) => String(r.payload?.aciklama ?? '—') },
                {
                  key: 'status', header: 'Durum', value: (r) => TR[r.status] ?? r.status,
                  render: (r) => <Badge tone={BADGE[r.status] ?? 'muted'}>{TR[r.status] ?? r.status}</Badge>,
                },
                { key: 'reason', header: 'Karar / Not', sortable: false, value: (r) => r.decisionReason ?? '', render: (r) => <span className="muted">{r.decisionReason ?? '—'}</span> },
              ]}
            />
          )}
        </Card>
      </>
    );
  }

  // Bilinmeyen konu.
  return (
    <>
      <PageHeader title="Bilgi" />
      {err && <Alert tone="err">{err}</Alert>}
      <Card className="reveal">
        <EmptyState icon="info" title="Bu konu bulunamadı" sub="Aradığınız sayfa mevcut değil." />
      </Card>
    </>
  );
}
