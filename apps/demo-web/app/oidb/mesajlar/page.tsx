'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, apiList } from '@/lib/api';
import {
  PageHeader,
  Card,
  DataTable,
  Badge,
  Button,
  Drawer,
  Alert,
  Skeleton,
  EmptyState,
  Segmented,
  toast,
  fmtDate,
} from '@/app/ui';

type Box = 'inbox' | 'sent';

interface Message {
  id: string;
  sender?: string | null;
  recipient?: string | null;
  subject: string;
  createdAt: string;
  read?: boolean;
  body?: string | null;
}
interface Recipient {
  id: string;
  name: string;
}

export default function Mesajlar(): React.ReactElement {
  const [box, setBox] = useState<Box>('inbox');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');

  // Mesaj detay paneli
  const [selected, setSelected] = useState<Message | null>(null);

  // Yeni mesaj paneli
  const [openNew, setOpenNew] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recErr, setRecErr] = useState('');
  const [recLoaded, setRecLoaded] = useState(false);
  const [toId, setToId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (b: Box) => {
    setLoaded(false);
    setErr('');
    try {
      const m = await api<Message[]>(`/messaging/${b}`);
      setMessages(m ?? []);
      setLoaded(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Mesajlar alınamadı');
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load(box);
  }, [box, load]);

  const openMessage = useCallback(
    async (m: Message) => {
      setSelected(m);
      if (box === 'inbox' && m.read === false) {
        try {
          await api(`/messaging/${m.id}/read`, { method: 'PATCH' });
          setMessages((list) =>
            list.map((x) => (x.id === m.id ? { ...x, read: true } : x)),
          );
          setSelected((s) => (s && s.id === m.id ? { ...s, read: true } : s));
        } catch {
          // sessizce geç: okundu işaretlenemese de içerik gösterilir
        }
      }
    },
    [box],
  );

  const openNewPanel = useCallback(async () => {
    setToId('');
    setSubject('');
    setBody('');
    setRecErr('');
    setOpenNew(true);
    if (!recLoaded) {
      try {
        const r = await apiList<Recipient>('/messaging/recipients');
        setRecipients(r ?? []);
        setRecLoaded(true);
      } catch (e) {
        setRecErr(e instanceof Error ? e.message : 'Alıcı listesi alınamadı');
      }
    }
  }, [recLoaded]);

  const send = useCallback(async () => {
    if (!toId || !subject.trim() || !body.trim()) {
      toast('Eksik bilgi', {
        tone: 'err',
        body: 'Alıcı, konu ve mesaj içeriği zorunludur.',
      });
      return;
    }
    setSaving(true);
    try {
      await api('/messaging', {
        method: 'POST',
        body: { recipientId: toId, subject: subject.trim(), body: body.trim() },
      });
      toast('Mesaj gönderildi', { tone: 'ok', body: subject.trim() });
      setOpenNew(false);
      await load(box);
    } catch (e) {
      toast('Mesaj gönderilemedi', {
        tone: 'err',
        body: e instanceof Error ? e.message : 'Hata',
      });
    } finally {
      setSaving(false);
    }
  }, [toId, subject, body, box, load]);

  return (
    <>
      <PageHeader
        title="Mesajlar"
        sub="Gelen ve giden mesajlarınızı görüntüleyin, yeni mesaj gönderin."
        actions={
          <Button icon="mail" onClick={openNewPanel}>
            Yeni Mesaj
          </Button>
        }
      />

      <div style={{ margin: '4px 0 16px' }}>
        <Segmented<Box>
          value={box}
          onChange={setBox}
          options={[
            { value: 'inbox', label: 'Gelen' },
            { value: 'sent', label: 'Giden' },
          ]}
        />
      </div>

      {err ? (
        <Alert tone="err">{err}</Alert>
      ) : !loaded ? (
        <Skeleton lines={6} />
      ) : messages.length === 0 ? (
        <EmptyState
          icon="mail"
          title={box === 'inbox' ? 'Gelen kutusu boş' : 'Gönderilmiş mesaj yok'}
          sub={
            box === 'inbox'
              ? 'Henüz mesajınız bulunmuyor.'
              : 'Henüz mesaj göndermediniz.'
          }
        />
      ) : (
        <Card
          title={box === 'inbox' ? 'Gelen Kutusu' : 'Gönderilmiş'}
          icon="mail"
          hint="İçeriği görüntülemek için bir mesaja tıklayın."
        >
          <DataTable
            rows={messages}
            empty="Mesaj yok."
            columns={[
              {
                key: 'peer',
                header: box === 'inbox' ? 'Gönderen' : 'Alıcı',
                value: (r) => (box === 'inbox' ? r.sender : r.recipient) ?? '',
                render: (r) => (
                  <div>
                    <b>{(box === 'inbox' ? r.sender : r.recipient) ?? '—'}</b>
                    {box === 'inbox' && r.read === false && (
                      <div className="meta">
                        <Badge tone="info">okunmadı</Badge>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'subject',
                header: 'Konu',
                value: (r) => r.subject,
                render: (r) => (
                  <span
                    style={{
                      fontWeight: box === 'inbox' && r.read === false ? 700 : 400,
                    }}
                  >
                    {r.subject}
                  </span>
                ),
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                value: (r) => r.createdAt,
                render: (r) => fmtDate(r.createdAt),
              },
              {
                key: 'action',
                header: '',
                sortable: false,
                render: (r) => (
                  <Button
                    variant="subtle"
                    sm
                    icon="eye"
                    onClick={() => openMessage(r)}
                  >
                    Aç
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* Mesaj detayı */}
      <Drawer
        open={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.subject ?? 'Mesaj'}
      >
        {selected && (
          <>
            <div className="info-box" style={{ marginTop: 0 }}>
              <div>
                {box === 'inbox' ? 'Gönderen' : 'Alıcı'}:{' '}
                <b>
                  {(box === 'inbox' ? selected.sender : selected.recipient) ?? '—'}
                </b>
              </div>
              <div>
                Tarih: <b>{fmtDate(selected.createdAt)}</b>
              </div>
            </div>
            <div
              style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, marginTop: 12 }}
            >
              {selected.body?.trim() ? (
                selected.body
              ) : (
                <span className="muted">Mesaj içeriği bulunmuyor.</span>
              )}
            </div>
          </>
        )}
      </Drawer>

      {/* Yeni mesaj */}
      <Drawer open={openNew} onClose={() => setOpenNew(false)} title="Yeni Mesaj">
        {recErr ? (
          <Alert tone="err">{recErr}</Alert>
        ) : !recLoaded ? (
          <Skeleton lines={4} />
        ) : recipients.length === 0 ? (
          <EmptyState
            icon="users"
            title="Alıcı bulunmuyor"
            sub="Mesaj gönderilebilecek alıcı yok."
          />
        ) : (
          <>
            <div className="field">
              <label>Alıcı</label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                aria-label="Alıcı"
              >
                <option value="">— alıcı seçin —</option>
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Konu</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="field">
              <label>Mesaj</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                maxLength={4000}
              />
            </div>
            <Button block icon="mail" onClick={send} disabled={saving}>
              {saving ? 'Gönderiliyor…' : 'Gönder'}
            </Button>
          </>
        )}
      </Drawer>
    </>
  );
}
