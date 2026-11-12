'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, Alert, Segmented,
  Drawer, EmptyState, Skeleton, toast, fmtDate,
} from '@/app/ui';

interface InboxMsg {
  id: string;
  fromUserId: string;
  fromEmail: string;
  toUserId: string;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
interface SentMsg {
  id: string;
  toUserId: string;
  toEmail: string;
  fromUserId: string;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
interface Recipient {
  userId: string;
  email: string;
}

type Box = 'inbox' | 'sent';

export default function Mesajlar(): React.ReactElement {
  const [box, setBox] = useState<Box>('inbox');
  const [inbox, setInbox] = useState<InboxMsg[]>([]);
  const [sent, setSent] = useState<SentMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [sel, setSel] = useState<{ box: Box; msg: InboxMsg | SentMsg } | null>(null);

  // Yeni mesaj
  const [compose, setCompose] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [recErr, setRecErr] = useState('');
  const [recLoading, setRecLoading] = useState(false);
  const [toUserId, setToUserId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [inb, snt] = await Promise.all([
      api<{ items: InboxMsg[] }>('/messaging/inbox'),
      api<{ items: SentMsg[] }>('/messaging/sent'),
    ]);
    setInbox(inb.items ?? []);
    setSent(snt.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const unread = useMemo(() => inbox.filter((m) => !m.readAt).length, [inbox]);

  function openCompose(): void {
    setCompose(true);
    setToUserId('');
    setSubject('');
    setBody('');
    if (recipients == null && !recLoading) {
      setRecLoading(true);
      setRecErr('');
      api<{ items: Recipient[] }>('/messaging/recipients')
        .then((r) => setRecipients(r.items ?? []))
        .catch((e) => setRecErr(e instanceof Error ? e.message : 'Alıcı listesi alınamadı'))
        .finally(() => setRecLoading(false));
    }
  }

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!toUserId || !subject.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await api('/messaging', { method: 'POST', body: { toUserId, subject, body } });
      toast('Mesaj gönderildi', { tone: 'ok', body: 'İletiniz alıcıya iletildi.' });
      setCompose(false);
      await load();
      setBox('sent');
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Mesaj gönderilemedi';
      toast('Mesaj gönderilemedi', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function openMsg(b: Box, msg: InboxMsg | SentMsg): Promise<void> {
    setSel({ box: b, msg });
    if (b === 'inbox' && !(msg as InboxMsg).readAt) {
      try {
        await api(`/messaging/${msg.id}/read`, { method: 'PATCH' });
        setInbox((xs) => xs.map((x) => (x.id === msg.id ? { ...x, readAt: new Date().toISOString() } : x)));
      } catch {
        /* okundu işareti sessiz kalabilir */
      }
    }
  }

  const list: (InboxMsg | SentMsg)[] = box === 'inbox' ? inbox : sent;

  return (
    <>
      <PageHeader
        title="Mesajlar"
        sub="Öğrenci işleri ve birimlerle yazışmalarınız."
        actions={<Button icon="edit" onClick={openCompose}>Yeni Mesaj</Button>}
      />

      {loading ? (
        <Skeleton lines={5} />
      ) : err ? (
        <Alert tone="err">{err}</Alert>
      ) : (
        <Card className="reveal">
          <div className="toolbar" style={{ marginBottom: 4 }}>
            <Segmented
              value={box}
              onChange={setBox}
              options={[
                { value: 'inbox', label: `Gelen${unread ? ` (${unread})` : ''}` },
                { value: 'sent', label: 'Giden' },
              ]}
            />
          </div>

          {list.length === 0 ? (
            <EmptyState
              icon="inbox"
              title={box === 'inbox' ? 'Gelen kutunuz boş' : 'Gönderilmiş mesaj yok'}
              sub={box === 'inbox' ? 'Size iletilen mesajlar burada görünür.' : 'Gönderdiğiniz mesajlar burada listelenir.'}
            />
          ) : (
            <div>
              {list.map((m) => {
                const isInbox = box === 'inbox';
                const who = isInbox ? (m as InboxMsg).fromEmail : (m as SentMsg).toEmail;
                const isUnread = isInbox && !(m as InboxMsg).readAt;
                return (
                  <button
                    key={m.id}
                    className="list-item"
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--line-2)', cursor: 'pointer' }}
                    onClick={() => openMsg(box, m)}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <b style={{ fontWeight: isUnread ? 700 : 600 }}>{m.subject}</b>
                        {isUnread && <Badge tone="info">Yeni</Badge>}
                      </div>
                      <div className="meta">{isInbox ? 'Gönderen: ' : 'Alıcı: '}{who}</div>
                    </div>
                    <span className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(m.createdAt)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Detay */}
      <Drawer open={sel != null} onClose={() => setSel(null)} title={sel?.msg.subject}>
        {sel && (
          <div>
            <div className="list-item">
              <span className="muted">{sel.box === 'inbox' ? 'Gönderen' : 'Alıcı'}</span>
              <b>{sel.box === 'inbox' ? (sel.msg as InboxMsg).fromEmail : (sel.msg as SentMsg).toEmail}</b>
            </div>
            <div className="list-item">
              <span className="muted">Tarih</span>
              <b>{fmtDate(sel.msg.createdAt)}</b>
            </div>
            {sel.box === 'inbox' && (
              <div className="list-item">
                <span className="muted">Durum</span>
                <Badge tone={(sel.msg as InboxMsg).readAt ? 'ok' : 'info'}>
                  {(sel.msg as InboxMsg).readAt ? 'Okundu' : 'Okunmadı'}
                </Badge>
              </div>
            )}
            <div className="list-item" style={{ display: 'block' }}>
              <div className="muted" style={{ marginBottom: 6 }}>Mesaj</div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{sel.msg.body}</div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Yeni mesaj */}
      <Drawer open={compose} onClose={() => setCompose(false)} title="Yeni Mesaj">
        {recLoading ? (
          <Skeleton lines={4} />
        ) : recErr ? (
          <Alert tone="err">{recErr}</Alert>
        ) : recipients && recipients.length === 0 ? (
          <EmptyState icon="users" title="Alıcı bulunamadı" sub="Mesaj gönderilebilecek bir kullanıcı listelenemedi." />
        ) : (
          <form onSubmit={send}>
            <div className="field">
              <label>Alıcı</label>
              <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} required>
                <option value="">Seçiniz…</option>
                {(recipients ?? []).map((r) => (
                  <option key={r.userId} value={r.userId}>{r.email}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Konu</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Mesaj konusu" required />
            </div>
            <div className="field">
              <label>Mesaj</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} rows={7} placeholder="Mesajınızı yazın" required />
            </div>
            <Button type="submit" icon="arrowRight" block disabled={busy || !toUserId || !subject.trim() || !body.trim()}>
              {busy ? 'Gönderiliyor…' : 'Gönder'}
            </Button>
          </form>
        )}
      </Drawer>
    </>
  );
}
