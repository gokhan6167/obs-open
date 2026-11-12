'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader, Card, Badge, Button, Alert, Skeleton, toast } from '@/app/ui';

interface Me {
  email?: string | null;
  phone?: string | null;
  student?: {
    studentNo: string;
    status: string;
    program: { name: string; code: string };
  };
}

const STATUS_TR: Record<string, string> = {
  active: 'Aktif',
  frozen: 'Dondurulmuş',
  graduated: 'Mezun',
  dismissed: 'İlişik kesildi',
};

export default function Ozluk(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Me>('/portal/me')
      .then((m) => {
        setMe(m);
        setPhone(m.phone ?? '');
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'));
  }, []);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed) {
      toast('Telefon zorunlu', { tone: 'err', body: 'Cep telefonu boş bırakılamaz.' });
      return;
    }
    setBusy(true);
    try {
      const updated = await api<Me>('/portal/me/contact', {
        method: 'PATCH',
        body: { phone: trimmed },
      });
      setMe((prev) => (prev ? { ...prev, phone: updated.phone ?? trimmed } : prev));
      setPhone(updated.phone ?? trimmed);
      toast('İletişim bilgisi güncellendi', { tone: 'ok', body: 'Cep telefonunuz kaydedildi.' });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İşlem başarısız';
      toast('Güncellenemedi', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  if (err)
    return (
      <>
        <PageHeader title="Özlük Bilgileri" />
        <Alert tone="err">{err}</Alert>
      </>
    );

  if (!me)
    return (
      <>
        <PageHeader title="Özlük Bilgileri" sub="Bilgileriniz yükleniyor…" />
        <Skeleton lines={5} />
      </>
    );

  const s = me.student;

  return (
    <>
      <PageHeader
        title="Özlük Bilgileri"
        sub="Kimlik ve program bilgileriniz salt-okunurdur; iletişim bilgilerinizi güncelleyebilirsiniz."
      />

      <Card icon="user" title="Kimlik ve Program" hint="Bu alanlar Öğrenci İşleri tarafından yönetilir." className="reveal">
        <div className="list-item">
          Öğrenci No
          <div className="meta">{s?.studentNo ?? '—'}</div>
        </div>
        <div className="list-item">
          Program
          <div className="meta">{s ? `${s.program.name} (${s.program.code})` : '—'}</div>
        </div>
        <div className="list-item">
          Öğrencilik Durumu
          <div className="meta">
            {s ? (
              <Badge tone={s.status === 'active' ? 'ok' : 'warn'}>
                {STATUS_TR[s.status] ?? s.status}
              </Badge>
            ) : (
              '—'
            )}
          </div>
        </div>
        <div className="list-item">
          E-posta
          <div className="meta">{me.email ?? '—'}</div>
        </div>
      </Card>

      <Card icon="edit" title="İletişim" hint="Güncel tutulması sizin sorumluluğunuzdadır.">
        <form onSubmit={submit} style={{ maxWidth: 420 }}>
          <div className="field">
            <label>Cep telefonu</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XX XXX XX XX"
              required
            />
            <div className="hint-sm">Zorunlu alan. Telefon boş bırakılarak kaydedilemez.</div>
          </div>
          <Button type="submit" icon="check" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </form>
      </Card>
    </>
  );
}
