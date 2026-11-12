'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, Alert, EmptyState, DataTable, toast, fmtDate,
} from '@/app/ui';

interface Me {
  student?: { id: string };
}
interface Req {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  decisionReason: string | null;
  createdAt: string;
}

// slug -> { başlık, backend tipi, alt-tür (diger için), açıklama }
const CONFIG: Record<string, { title: string; type: string; subtype?: string; desc: string }> = {
  belge: { title: 'Online Belge Talebi', type: 'belge', desc: 'Öğrenci belgesi, transkript vb. resmi belge talebi.' },
  'kayit-dondurma': { title: 'Kayıt Dondurma Talebi', type: 'kayit_dondurma', desc: 'Dönem izni / kayıt dondurma başvurusu (azami süreye etkisiyle).' },
  mazeret: { title: 'Mazeret Sınavı Talebi', type: 'mazeret_sinavi', desc: 'Geçerli mazeret nedeniyle sınav hakkı talebi.' },
  itiraz: { title: 'Sınav İtirazı', type: 'diger', subtype: 'sinav_itiraz', desc: 'İlan edilen not için maddi hata itirazı.' },
  'tek-ders': { title: 'Tek Ders Başvurusu', type: 'diger', subtype: 'tek_ders', desc: 'Mezuniyet için tek ders sınav hakkı başvurusu.' },
  'ek-sinav': { title: 'Azami Süre Ek Sınav', type: 'diger', subtype: 'ek_sinav', desc: 'Azami süre sonu ek sınav hakkı başvurusu.' },
  muafiyet: { title: 'Muafiyet Başvurusu', type: 'diger', subtype: 'muafiyet', desc: 'Daha önce alınan derslerden muafiyet (intibak) talebi.' },
};
const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  submitted: 'warn', in_review: 'warn', approved: 'ok', rejected: 'danger', cancelled: 'muted',
};
const TR: Record<string, string> = {
  submitted: 'Başvuruldu', in_review: 'İncelemede', approved: 'Onaylandı', rejected: 'Reddedildi', cancelled: 'İptal',
};

export default function TalepSayfasi(): React.ReactElement {
  const params = useParams();
  const slug = String(params.tur);
  const cfg = CONFIG[slug];

  const [studentId, setStudentId] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<Req[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!cfg) return;
    const [m, reqs] = await Promise.all([api<Me>('/portal/me'), api<Req[]>('/portal/requests')]);
    setStudentId(m.student?.id ?? '');
    setItems(
      reqs.filter(
        (r) => r.type === cfg.type && (!cfg.subtype || r.payload?.subtype === cfg.subtype),
      ),
    );
  }, [cfg]);

  useEffect(() => {
    setMsg('');
    setErr('');
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  if (!cfg) return <Alert tone="err">Bilinmeyen talep türü.</Alert>;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const payload: Record<string, unknown> = { aciklama: note };
      if (cfg.subtype) payload.subtype = cfg.subtype;
      await api('/requests', { method: 'POST', body: { studentId, type: cfg.type, payload } });
      setMsg('Talebiniz alındı ve ilgili birimin onayına düştü.');
      setNote('');
      await load();
      toast('Talep gönderildi', { tone: 'ok', body: `${cfg.title} ilgili birime iletildi.` });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Talep gönderilemedi';
      setErr(m);
      toast('Talep gönderilemedi', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={cfg.title} sub={cfg.desc} />
      <Card icon="edit" title="Yeni Talep" className="reveal">
        {msg && <Alert tone="ok">{msg}</Alert>}
        {err && <Alert tone="err">{err}</Alert>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Açıklama / gerekçe</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              required
              style={{ width: '100%', padding: 10, border: '1px solid var(--line)', borderRadius: 9, fontFamily: 'inherit', fontSize: 14 }}
            />
          </div>
          <Button type="submit" icon="arrowRight" disabled={busy || !studentId}>
            {busy ? 'Gönderiliyor…' : 'Talebi gönder'}
          </Button>
        </form>
      </Card>

      <Card icon="fileText" title="Taleplerim" className="reveal">
        {items.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="Bu türde talep yok"
            sub="Yukarıdaki formu doldurarak başvuru oluşturabilirsiniz."
          />
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
              { key: 'reason', header: 'Karar', sortable: false, value: (r) => r.decisionReason ?? '', render: (r) => <span className="muted">{r.decisionReason ?? '—'}</span> },
            ]}
          />
        )}
      </Card>
    </>
  );
}
