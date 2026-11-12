'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Button,
  Alert,
  Skeleton,
  EmptyState,
  Segmented,
  Drawer,
  BarChart,
  Icon,
  toast,
} from '@/app/ui';

type Mode = 'mock' | 'live';

interface Integration {
  key: string;
  name: string;
  baseUrl: string | null;
  enabled: boolean;
  mode: string;
  configured: boolean;
}

interface ChannelStat {
  channel: string;
  total: number;
  sent: number;
  lastAt: string | null;
}

interface Stats {
  notifications: { byChannel: ChannelStat[]; total: number };
  integrations: {
    expected: number;
    configured: number;
    enabled: number;
    live: number;
    mock: number;
    missing: string[];
  };
}

const MODES: { value: Mode; label: string }[] = [
  { value: 'mock', label: 'Mock' },
  { value: 'live', label: 'Live' },
];

/** Bildirim kanalı kodları için okunabilir etiketler. */
const CHANNEL_TR: Record<string, string> = {
  sms: 'SMS',
  email: 'E-posta',
  push: 'Push',
};

/** Entegrasyon anahtarına göre kart ikonu; bilinmeyen anahtarlarda genel bağlantı ikonu. */
const KEY_ICON: Record<string, string> = {
  ebys: 'fileText',
  lms: 'book',
  sms: 'bell',
  email: 'mail',
  banka: 'money',
  mernis: 'shield',
  yoksis: 'building',
};

/** Sadece http/https adresleri bağlantı olarak render edilir (javascript:/data: engeli). */
const isSafeUrl = (url: string | null): boolean => !!url && /^https?:\/\//i.test(url);

function fmtDateTime(s: string | null): string {
  if (!s) return '—';
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? String(s) : new Date(t).toLocaleString('tr-TR');
}

export default function Entegrasyonlar(): React.ReactElement {
  const [items, setItems] = useState<Integration[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Düzenleme drawer'ı
  const [edit, setEdit] = useState<Integration | null>(null);
  const [fName, setFName] = useState('');
  const [fBaseUrl, setFBaseUrl] = useState('');
  const [fEnabled, setFEnabled] = useState(false);
  const [fMode, setFMode] = useState<Mode>('mock');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [list, st] = await Promise.all([
      api<{ items: Integration[] }>('/integrations'),
      api<Stats>('/integrations/stats'),
    ]);
    setItems(list.items);
    setStats(st);
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .then(() => setErr(''))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, [load]);

  function openEdit(it: Integration): void {
    setEdit(it);
    setFName(it.name);
    setFBaseUrl(it.baseUrl ?? '');
    setFEnabled(it.enabled);
    setFMode(it.mode === 'live' ? 'live' : 'mock');
  }

  async function save(): Promise<void> {
    if (!edit) return;
    const name = fName.trim();
    const baseUrl = fBaseUrl.trim();
    if (!name) {
      toast('Eksik bilgi', { tone: 'info', body: 'Entegrasyon adı boş bırakılamaz.' });
      return;
    }
    if (baseUrl && !isSafeUrl(baseUrl)) {
      toast('Geçersiz adres', {
        tone: 'err',
        body: 'Servis adresi http:// veya https:// ile başlamalıdır.',
      });
      return;
    }
    setBusy(true);
    try {
      const body: { name: string; baseUrl?: string; enabled: boolean; mode: Mode } = {
        name,
        enabled: fEnabled,
        mode: fMode,
      };
      if (baseUrl) body.baseUrl = baseUrl;
      await api(`/integrations/${encodeURIComponent(edit.key)}`, { method: 'PUT', body });
      toast('Entegrasyon kaydedildi', {
        tone: 'ok',
        body: `${name} · ${fEnabled ? 'açık' : 'kapalı'} · ${fMode} mod.`,
      });
      setEdit(null);
      await load();
    } catch (e) {
      toast('Kaydedilemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Bilinmeyen hata' });
    } finally {
      setBusy(false);
    }
  }

  if (err) return <Alert tone="err">{err}</Alert>;

  const chan = stats?.notifications.byChannel ?? [];

  return (
    <>
      <PageHeader
        title="Entegrasyonlar"
        sub="Kurum dışı servis tanımları, çalışma modu ve bildirim kanalı özeti."
        actions={
          <Button variant="subtle" icon="refresh" onClick={() => void load()} disabled={loading || busy}>
            Yenile
          </Button>
        }
      />

      <Alert tone="info">
        Entegrasyonlar mock modda çalışır; live mod gerçek kurum anlaşması ve kimlik bilgisi gerektirir.
      </Alert>

      {loading ? (
        <Skeleton lines={4} />
      ) : stats ? (
        <>
          <StatGrid
            stats={[
              {
                label: `Aktif entegrasyon (${stats.integrations.expected} beklenen)`,
                value: stats.integrations.enabled,
                icon: 'link',
                tone: stats.integrations.enabled > 0 ? 'ok' : 'warn',
              },
              { label: 'Tanımlı entegrasyon', value: stats.integrations.configured, icon: 'layers' },
              {
                label: 'Live modda',
                value: stats.integrations.live,
                icon: 'activity',
                ...(stats.integrations.live > 0 ? { tone: 'ok' as const } : {}),
              },
              { label: 'Toplam bildirim', value: stats.notifications.total, icon: 'bell' },
              ...chan.map((c) => ({
                label: `${CHANNEL_TR[c.channel] ?? c.channel} bildirimi`,
                value: c.total,
                icon: c.channel === 'email' ? 'mail' : 'bell',
              })),
            ]}
          />

          <Card
            title="Kanal Bazlı Bildirim Dağılımı"
            icon="chart"
            hint="Mock gönderim loglarından kanal bazında toplam adetler."
          >
            {chan.length === 0 ? (
              <EmptyState
                icon="bell"
                title="Bildirim kaydı yok"
                sub="Henüz hiçbir kanaldan bildirim gönderilmemiş."
              />
            ) : (
              <>
                <BarChart
                  data={chan.map((c) => ({ label: CHANNEL_TR[c.channel] ?? c.channel, value: c.total }))}
                />
                <div style={{ marginTop: 30 }}>
                  {chan.map((c) => (
                    <div key={c.channel} className="list-item">
                      <div className="li-main">
                        <div style={{ fontWeight: 600 }}>{CHANNEL_TR[c.channel] ?? c.channel}</div>
                        <div className="meta">Son gönderim: {fmtDateTime(c.lastAt)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700 }}>{c.total}</div>
                        <div className="meta">{c.sent} gönderildi</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </>
      ) : null}

      {loading ? (
        <Skeleton lines={8} />
      ) : items.length === 0 ? (
        <Card title="Entegrasyonlar" icon="link">
          <EmptyState
            icon="link"
            title="Entegrasyon bulunamadı"
            sub="Bu kurum için tanımlı ya da beklenen entegrasyon yok."
          />
        </Card>
      ) : (
        <div className="two-col">
          {items.map((it) => (
            <Card
              key={it.key}
              title={it.name}
              icon={KEY_ICON[it.key] ?? 'link'}
              hint={it.key}
              actions={
                <Button variant="subtle" sm icon="edit" onClick={() => openEdit(it)}>
                  Düzenle
                </Button>
              }
            >
              <div className="row" style={{ marginBottom: 12 }}>
                <Badge tone={it.enabled ? 'ok' : 'muted'}>{it.enabled ? 'Açık' : 'Kapalı'}</Badge>
                <Badge tone={it.mode === 'live' ? 'ok' : 'warn'}>
                  {it.mode === 'live' ? 'live mod' : 'mock mod'}
                </Badge>
                {!it.configured && <Badge tone="muted">Tanımsız</Badge>}
              </div>
              <div className="list-item">
                <div className="li-main">
                  <div style={{ fontWeight: 600 }}>Servis adresi</div>
                  <div className="meta">baseUrl</div>
                </div>
                <div style={{ textAlign: 'right', wordBreak: 'break-all', maxWidth: '60%' }}>
                  {isSafeUrl(it.baseUrl) ? (
                    <a
                      href={it.baseUrl as string}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: 'var(--accent)', fontWeight: 600 }}
                    >
                      {it.baseUrl}
                    </a>
                  ) : (
                    <span className="muted">{it.baseUrl ? it.baseUrl : '—'}</span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Drawer
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={
          <span className="row" style={{ gap: 8 }}>
            <Icon name={edit ? (KEY_ICON[edit.key] ?? 'link') : 'link'} size={16} />
            {edit ? edit.name : ''}
          </span>
        }
      >
        {edit && (
          <>
            <div className="field">
              <label htmlFor="int-name">Entegrasyon adı</label>
              <input
                id="int-name"
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="ör. SMS Sağlayıcı"
              />
              <div className="hint-sm">Anahtar: {edit.key} (değiştirilemez)</div>
            </div>

            <div className="field">
              <label htmlFor="int-url">Servis adresi</label>
              <input
                id="int-url"
                value={fBaseUrl}
                onChange={(e) => setFBaseUrl(e.target.value)}
                placeholder="https://servis.kurum.edu.tr/api"
              />
              <div className="hint-sm">
                http:// veya https:// ile başlamalıdır. Boş bırakılırsa mevcut adres korunur.
              </div>
            </div>

            <div className="field">
              <label>Çalışma modu</label>
              <Segmented<Mode> value={fMode} onChange={setFMode} options={MODES} />
              <div className="hint-sm">
                Live mod gerçek kurum anlaşması ve kimlik bilgisi gerektirir.
              </div>
            </div>

            <div className="field">
              <label htmlFor="int-enabled">Durum</label>
              <label className="row" style={{ gap: 8, fontWeight: 600 }}>
                <input
                  id="int-enabled"
                  type="checkbox"
                  checked={fEnabled}
                  onChange={(e) => setFEnabled(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Entegrasyon açık
              </label>
            </div>

            <hr className="divider" />

            <div className="row">
              <Button icon="check" onClick={() => void save()} disabled={busy}>
                {busy ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
              <Button variant="subtle" onClick={() => setEdit(null)} disabled={busy}>
                Vazgeç
              </Button>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
