'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Drawer,
  Icon,
  fmtDate,
  toast,
} from '@/app/ui';

type Channel = 'sms' | 'email';

interface NotifLog {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string | null;
  status: string;
  providerRef: string | null;
  createdAt: string;
}

const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'E-posta' },
];

const CHANNEL_TR: Record<string, string> = { sms: 'SMS', email: 'E-posta' };

const STATUS_TR: Record<string, string> = {
  gonderildi: 'Gönderildi',
  beklemede: 'Beklemede',
  hatali: 'Hatalı',
};

/** Log tarihleri saat bilgisiyle anlamlı; fmtDate + saat/dakika. */
function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return `${fmtDate(s)} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

function statusTone(s: string): 'ok' | 'danger' | 'warn' | 'muted' {
  if (s === 'gonderildi') return 'ok';
  if (s === 'hatali') return 'danger';
  if (s === 'beklemede') return 'warn';
  return 'muted';
}

export default function BildirimLoglari(): React.ReactElement {
  const [all, setAll] = useState<NotifLog[]>([]);
  const [rows, setRows] = useState<NotifLog[]>([]);
  const [filter, setFilter] = useState<Channel | ''>('');
  const [detail, setDetail] = useState<NotifLog | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Test gönderim formu
  const [channel, setChannel] = useState<Channel>('sms');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    // İstatistikler tüm loglardan; tablo ise ?channel filtresiyle sunucudan gelir.
    const full = await api<{ items: NotifLog[] }>('/integrations/notifications');
    setAll(full.items);
    if (filter) {
      const one = await api<{ items: NotifLog[] }>(
        `/integrations/notifications?channel=${encodeURIComponent(filter)}`,
      );
      setRows(one.items);
    } else {
      setRows(full.items);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load()
      .then(() => setErr(''))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, [load]);

  const counts = useMemo(() => {
    let sms = 0;
    let email = 0;
    for (const r of all) {
      if (r.channel === 'sms') sms += 1;
      else if (r.channel === 'email') email += 1;
    }
    return { total: all.length, sms, email };
  }, [all]);

  async function sendTest(): Promise<void> {
    if (!recipient.trim() || !body.trim()) {
      toast('Eksik bilgi', { tone: 'info', body: 'Alıcı ve gövde alanları zorunludur.' });
      return;
    }
    setBusy(true);
    try {
      const res = await api<NotifLog>('/integrations/notify', {
        method: 'POST',
        body: {
          channel,
          recipient: recipient.trim(),
          subject: subject.trim() || undefined,
          body: body.trim(),
        },
      });
      toast('Bildirim kuyruğa alındı', {
        tone: 'ok',
        body: `${CHANNEL_TR[channel]} · ${res.recipient} (mock gönderim, ref: ${res.providerRef ?? '—'}).`,
      });
      setBody('');
      setSubject('');
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Gönderim başarısız';
      toast('Gönderim başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Bildirim Logları"
        sub="SMS ve e-posta gönderim kayıtları. Test gönderimleri mock sağlayıcı üzerinden loglanır."
        actions={
          <Button
            variant="subtle"
            icon="refresh"
            onClick={() => void load()}
            disabled={loading || busy}
          >
            Yenile
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam gönderim', value: counts.total, icon: 'bell' },
            { label: 'SMS', value: counts.sms, icon: 'activity' },
            { label: 'E-posta', value: counts.email, icon: 'mail' },
          ]}
        />
      )}

      <Card
        title="Test Gönderimi"
        icon="upload"
        hint="Kanalı seçip alıcı ve gövdeyi girin; kayıt loglara düşer."
      >
        <Alert tone="info">
          Gönderim mock sağlayıcı üzerinden yapılır; alıcıya gerçek SMS veya e-posta iletilmez.
          Yalnızca log kaydı oluşturulur.
        </Alert>

        <div className="field">
          <label>Kanal</label>
          <Segmented<Channel> value={channel} onChange={setChannel} options={CHANNELS} />
        </div>

        <div className="two-col">
          <div className="field">
            <label htmlFor="recipient">Alıcı</label>
            <input
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={channel === 'sms' ? 'ör. 5321234567' : 'ör. ogrenci@example.edu'}
              maxLength={200}
            />
            <div className="hint-sm">
              {channel === 'sms' ? 'Cep telefonu numarası.' : 'E-posta adresi.'}
            </div>
          </div>

          <div className="field">
            <label htmlFor="subject">Konu</label>
            <input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="ör. Harç ödeme hatırlatması"
              maxLength={300}
            />
            <div className="hint-sm">İsteğe bağlı; SMS kanalında genellikle boş bırakılır.</div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="body">Gövde</label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Gönderilecek mesaj metni"
            maxLength={5000}
          />
          <div className="hint-sm">{body.length} / 5000 karakter</div>
        </div>

        <Button icon="mail" onClick={() => void sendTest()} disabled={busy}>
          {busy ? 'Gönderiliyor…' : 'Test Gönder'}
        </Button>
      </Card>

      <Card
        title="Gönderim Kayıtları"
        icon="layers"
        hint={`${rows.length} kayıt (en yeni 200)`}
        actions={
          <Segmented<Channel | ''>
            value={filter}
            onChange={setFilter}
            options={[{ value: '', label: 'Hepsi' }, ...CHANNELS]}
          />
        }
      >
        {loading ? (
          <Skeleton lines={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="Bildirim kaydı yok"
            sub="Seçili kanal için henüz gönderim yapılmamış. Yukarıdaki formdan test gönderimi deneyebilirsiniz."
          />
        ) : (
          <DataTable<NotifLog>
            rows={rows}
            search
            csv
            csvName="bildirim-loglari"
            columns={[
              {
                key: 'channel',
                header: 'Kanal',
                sortable: true,
                value: (r) => CHANNEL_TR[r.channel] ?? r.channel,
                render: (r) => (
                  <span className="row" style={{ gap: 6 }}>
                    <Icon name={r.channel === 'sms' ? 'activity' : 'mail'} size={15} />
                    <b>{CHANNEL_TR[r.channel] ?? r.channel}</b>
                  </span>
                ),
              },
              { key: 'recipient', header: 'Alıcı', sortable: true, value: (r) => r.recipient },
              {
                key: 'subject',
                header: 'Konu',
                sortable: true,
                value: (r) => r.subject ?? '',
                render: (r) => r.subject ?? <span className="muted">—</span>,
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={statusTone(r.status)}>{STATUS_TR[r.status] ?? r.status}</Badge>
                ),
              },
              {
                key: 'providerRef',
                header: 'Sağlayıcı Ref.',
                sortable: true,
                value: (r) => r.providerRef ?? '',
                render: (r) => r.providerRef ?? <span className="muted">—</span>,
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                sortable: true,
                value: (r) => r.createdAt,
                render: (r) => fmtDateTime(r.createdAt),
              },
              {
                key: 'act',
                header: '',
                sortable: false,
                render: (r) => (
                  <Button variant="subtle" sm icon="eye" onClick={() => setDetail(r)}>
                    Gövde
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={
          <span className="row" style={{ gap: 8 }}>
            <Icon name={detail?.channel === 'sms' ? 'activity' : 'mail'} size={16} />
            {detail ? `${CHANNEL_TR[detail.channel] ?? detail.channel} · ${detail.recipient}` : ''}
          </span>
        }
      >
        {detail && (
          <>
            <div className="list-item">
              <div className="li-main">
                <div style={{ fontWeight: 600 }}>Durum</div>
                <div className="meta">{fmtDateTime(detail.createdAt)}</div>
              </div>
              <Badge tone={statusTone(detail.status)}>
                {STATUS_TR[detail.status] ?? detail.status}
              </Badge>
            </div>
            <div className="list-item">
              <div className="li-main">
                <div style={{ fontWeight: 600 }}>Sağlayıcı referansı</div>
                <div className="meta">Mock sağlayıcı tarafından üretildi</div>
              </div>
              <div style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-all' }}>
                {detail.providerRef ?? '—'}
              </div>
            </div>

            <div style={{ fontWeight: 700, fontSize: 13.5, margin: '14px 0 4px' }}>
              {detail.subject ?? 'Konu belirtilmemiş'}
            </div>
            <hr className="divider" />

            {detail.body ? (
              <pre
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'inherit',
                  color: 'var(--text-2)',
                }}
              >
                {detail.body}
              </pre>
            ) : (
              <EmptyState
                icon="inbox"
                title="Gövde yok"
                sub="Bu kayıt için saklanmış mesaj metni bulunmuyor."
              />
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
