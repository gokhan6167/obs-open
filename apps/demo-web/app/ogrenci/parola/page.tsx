'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader, Card, Alert, Button, toast } from '@/app/ui';

export default function Parola(): React.ReactElement {
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMsg('');
    setErr('');
    if (newPassword.length < 8) {
      setErr('Yeni parola en az 8 karakter olmalı.');
      return;
    }
    if (newPassword !== again) {
      setErr('Yeni parolalar uyuşmuyor.');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { oldPassword, newPassword } });
      setMsg('Parolanız güncellendi.');
      setOld('');
      setNew('');
      setAgain('');
      toast('Parola değiştirildi', { tone: 'ok', body: 'Yeni parolanız Argon2id ile güvenli şekilde saklandı.' });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İşlem başarısız';
      setErr(m);
      toast('Parola değiştirilemedi', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Parola Değiştirme"
        sub="Mevcut parola doğrulanır; yeni parola Argon2id ile saklanır."
      />
      <Card icon="shield" title="Güvenlik" className="reveal">
        <div style={{ maxWidth: 420 }}>
          {msg && <Alert tone="ok">{msg}</Alert>}
          {err && <Alert tone="err">{err}</Alert>}
          <form onSubmit={submit}>
            <div className="field">
              <label>Mevcut parola</label>
              <input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} required />
            </div>
            <div className="field">
              <label>Yeni parola (min 8)</label>
              <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} required />
            </div>
            <div className="field">
              <label>Yeni parola (tekrar)</label>
              <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} required />
            </div>
            <Button type="submit" icon="check" disabled={busy}>
              {busy ? 'Güncelleniyor…' : 'Parolayı değiştir'}
            </Button>
          </form>
        </div>
      </Card>
    </>
  );
}
