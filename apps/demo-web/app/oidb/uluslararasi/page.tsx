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
  Drawer,
  EmptyState,
  toast,
  money,
  fmtDate,
} from '@/app/ui';

interface IntlRow {
  id: string;
  applicantId: string;
  applicantName: string;
  programId: string;
  programName: string;
  country: string | null;
  depositAmount: number | null;
  depositPaid: boolean;
  acceptanceLetterNo: string | null;
  visaStatus: string;
  status: string;
  note: string | null;
  createdAt: string;
}

interface Program {
  id: string;
  name: string;
}

interface Applicant {
  id: string;
  fullName: string;
  osymNo?: string | null;
  status?: string;
}

type VisaStatus = 'beklemede' | 'basvuruldu' | 'alindi' | 'red';
type IntlStatus = 'on_kabul' | 'kabul' | 'kayit' | 'iptal';

const VISA: { value: VisaStatus; label: string }[] = [
  { value: 'beklemede', label: 'Beklemede' },
  { value: 'basvuruldu', label: 'Başvuruldu' },
  { value: 'alindi', label: 'Alındı' },
  { value: 'red', label: 'Reddedildi' },
];

const STATUS: { value: IntlStatus; label: string }[] = [
  { value: 'on_kabul', label: 'Ön kabul' },
  { value: 'kabul', label: 'Kabul' },
  { value: 'kayit', label: 'Kayıt' },
  { value: 'iptal', label: 'İptal' },
];

const visaLabel = (v: string): string => VISA.find((x) => x.value === v)?.label ?? v;
const statusLabel = (s: string): string => STATUS.find((x) => x.value === s)?.label ?? s;

function visaTone(v: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (v === 'alindi') return 'ok';
  if (v === 'red') return 'danger';
  if (v === 'basvuruldu') return 'info';
  return 'muted';
}

function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (s === 'kayit') return 'ok';
  if (s === 'kabul') return 'info';
  if (s === 'iptal') return 'danger';
  return 'warn';
}

/** "1.250,50" / "1250.5" girdisini kuruşa çevirir; geçersizse null. */
function tlToKurus(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  const n = Number(raw.replace(/\./g, '').replace(',', '.'));
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export default function UluslararasiKabul(): React.ReactElement {
  const [rows, setRows] = useState<IntlRow[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Satır sürgüsü (işlemler).
  const [sel, setSel] = useState<IntlRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowErr, setRowErr] = useState('');
  const [letterWarn, setLetterWarn] = useState('');
  const [visa, setVisa] = useState<VisaStatus>('beklemede');
  const [status, setStatus] = useState<IntlStatus>('on_kabul');

  // Yeni kayıt sürgüsü.
  const [open, setOpen] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState('');
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [picked, setPicked] = useState<Applicant | null>(null);
  const [country, setCountry] = useState('');
  const [depositTl, setDepositTl] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    const res = await api<{ items: IntlRow[] }>('/international');
    setRows(res.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Kayıtlar yüklenemedi'))
      .finally(() => setLoading(false));
  }, [load]);

  // Yeni kayıt sürgüsü açıldığında başvuru programlarını getir.
  useEffect(() => {
    if (!open || programs.length > 0) return;
    api<{ items: Program[] }>('/admissions/programs')
      .then((d) => {
        setPrograms(d.items ?? []);
        if ((d.items ?? []).length > 0) setProgramId(d.items[0].id);
      })
      .catch((e) => setFormErr(e instanceof Error ? e.message : 'Programlar yüklenemedi'));
  }, [open, programs.length]);

  // Seçili programın adayları.
  useEffect(() => {
    if (!open || !programId) return;
    setApplicantsLoading(true);
    setFormErr('');
    api<{ items: Applicant[] }>(
      `/admissions/applicants?applicationProgramId=${encodeURIComponent(programId)}`,
    )
      .then((d) => setApplicants(d.items ?? []))
      .catch((e) => setFormErr(e instanceof Error ? e.message : 'Adaylar yüklenemedi'))
      .finally(() => setApplicantsLoading(false));
  }, [open, programId]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      paid: rows.filter((r) => r.depositPaid).length,
      letter: rows.filter((r) => r.acceptanceLetterNo).length,
      visa: rows.filter((r) => r.visaStatus === 'alindi').length,
    }),
    [rows],
  );

  function openRow(r: IntlRow): void {
    setSel(r);
    setVisa(r.visaStatus as VisaStatus);
    setStatus(r.status as IntlStatus);
    setRowErr('');
    setLetterWarn('');
  }

  function closeRow(): void {
    setSel(null);
    setRowErr('');
    setLetterWarn('');
  }

  /** Satır sürgüsündeki PATCH işlemleri; dönen kayıtla sürgüyü tazeler. */
  async function patch(body: Record<string, unknown>, okTitle: string): Promise<void> {
    if (!sel) return;
    setBusy(true);
    setRowErr('');
    setLetterWarn('');
    try {
      const updated = await api<IntlRow>(`/international/${sel.id}`, { method: 'PATCH', body });
      setSel({ ...sel, ...updated });
      toast(okTitle, { tone: 'ok', body: sel.applicantName });
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İşlem başarısız';
      setRowErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function issueLetter(): Promise<void> {
    if (!sel) return;
    setBusy(true);
    setRowErr('');
    setLetterWarn('');
    try {
      const updated = await api<IntlRow>(`/international/${sel.id}/acceptance-letter`, {
        method: 'POST',
      });
      setSel({ ...sel, ...updated });
      toast('Resmi kabul belgesi üretildi', {
        tone: 'ok',
        body: `${sel.applicantName} · ${updated.acceptanceLetterNo ?? ''}`,
      });
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Belge üretilemedi';
      // Depozito ödenmeden belge düzenlenemez (409) -> uyarı olarak göster.
      if (!sel.depositPaid) setLetterWarn(m);
      else setRowErr(m);
      toast('Belge üretilemedi', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  function closeNew(): void {
    setOpen(false);
    setPicked(null);
    setCountry('');
    setDepositTl('');
    setNote('');
    setFormErr('');
  }

  async function submit(): Promise<void> {
    if (!picked) {
      setFormErr('Önce aday seçin.');
      return;
    }
    const kurus = tlToKurus(depositTl);
    if (depositTl.trim() && kurus === null) {
      setFormErr('Depozito tutarı geçersiz.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api('/international', {
        method: 'POST',
        body: {
          applicantId: picked.id,
          ...(country.trim() ? { country: country.trim() } : {}),
          ...(kurus !== null ? { depositAmount: kurus } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      toast('Uluslararası kabul kaydı oluşturuldu', {
        tone: 'ok',
        body: `${picked.fullName}${country.trim() ? ` · ${country.trim()}` : ''}`,
      });
      closeNew();
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Uluslararası Kabul"
        sub="Yabancı uyruklu aday kabul dosyaları; depozito, vize takibi ve resmi kabul belgesi."
        actions={
          <Button icon="upload" onClick={() => setOpen(true)}>
            Yeni kayıt
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam kayıt', value: stats.total, icon: 'layers' },
            { label: 'Depozito ödendi', value: stats.paid, icon: 'wallet', tone: 'ok' },
            { label: 'Kabul belgesi', value: stats.letter, icon: 'fileText' },
            { label: 'Vize alındı', value: stats.visa, icon: 'flag', tone: 'ok' },
          ]}
        />
      )}

      <Card title="Uluslararası kabul kayıtları" icon="flag">
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<IntlRow>
            rows={rows}
            search
            csv
            csvName="oidb-uluslararasi-kabul"
            empty={
              <EmptyState
                icon="flag"
                title="Uluslararası kabul kaydı yok"
                sub="Sağ üstten aday seçerek yeni kabul dosyası açabilirsiniz."
              />
            }
            columns={[
              {
                key: 'applicantName',
                header: 'Aday',
                sortable: true,
                value: (r) => r.applicantName,
                render: (r) => (
                  <>
                    <b>{r.applicantName}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.programName}
                    </div>
                  </>
                ),
              },
              {
                key: 'country',
                header: 'Ülke',
                sortable: true,
                value: (r) => r.country ?? '',
                render: (r) => r.country ?? <span className="muted">—</span>,
              },
              {
                key: 'depositAmount',
                header: 'Depozito',
                sortable: true,
                num: true,
                value: (r) => r.depositAmount ?? 0,
                render: (r) => money(r.depositAmount),
              },
              {
                key: 'depositPaid',
                header: 'Depozito Durumu',
                sortable: true,
                value: (r) => (r.depositPaid ? 'Ödendi' : 'Ödenmedi'),
                render: (r) => (
                  <Badge tone={r.depositPaid ? 'ok' : 'warn'}>
                    {r.depositPaid ? 'Ödendi' : 'Ödenmedi'}
                  </Badge>
                ),
              },
              {
                key: 'visaStatus',
                header: 'Vize',
                sortable: true,
                value: (r) => visaLabel(r.visaStatus),
                render: (r) => <Badge tone={visaTone(r.visaStatus)}>{visaLabel(r.visaStatus)}</Badge>,
              },
              {
                key: 'acceptanceLetterNo',
                header: 'Kabul Belge No',
                sortable: true,
                value: (r) => r.acceptanceLetterNo ?? '',
                render: (r) => r.acceptanceLetterNo ?? <span className="muted">—</span>,
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => statusLabel(r.status),
                render: (r) => <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>,
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                sortable: true,
                value: (r) => r.createdAt,
                render: (r) => fmtDate(r.createdAt),
              },
              {
                key: 'action',
                header: 'İşlem',
                render: (r) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => openRow(r)}>
                    İşlemler
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Satır işlemleri */}
      <Drawer
        open={!!sel}
        onClose={closeRow}
        title={sel ? `Uluslararası kabul · ${sel.applicantName}` : undefined}
      >
        {sel && (
          <>
            {rowErr && <Alert tone="err">{rowErr}</Alert>}

            <div className="info-box">
              <div>
                <b>{sel.applicantName}</b> · {sel.programName}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {sel.country ?? 'Ülke belirtilmemiş'} · Depozito: {money(sel.depositAmount)} ·{' '}
                {fmtDate(sel.createdAt)}
              </div>
              {sel.note && (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {sel.note}
                </div>
              )}
            </div>

            <h2>Depozito</h2>
            <div className="row" style={{ alignItems: 'center', gap: 10 }}>
              <Badge tone={sel.depositPaid ? 'ok' : 'warn'}>
                {sel.depositPaid ? 'Ödendi' : 'Ödenmedi'}
              </Badge>
              <Button
                variant="ok"
                sm
                icon="check"
                disabled={busy || sel.depositPaid}
                onClick={() => void patch({ depositPaid: true }, 'Depozito ödendi olarak işaretlendi')}
              >
                Depozito ödendi işaretle
              </Button>
            </div>

            <h2>Vize durumu</h2>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                <label>Vize</label>
                <select value={visa} onChange={(e) => setVisa(e.target.value as VisaStatus)}>
                  {VISA.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="ghost"
                icon="check"
                disabled={busy || visa === sel.visaStatus}
                onClick={() => void patch({ visaStatus: visa }, 'Vize durumu güncellendi')}
              >
                Kaydet
              </Button>
            </div>

            <h2>Kabul durumu</h2>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                <label>Durum</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as IntlStatus)}>
                  {STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="ghost"
                icon="check"
                disabled={busy || status === sel.status}
                onClick={() => void patch({ status }, 'Durum güncellendi')}
              >
                Kaydet
              </Button>
            </div>

            <h2>Resmi kabul belgesi</h2>
            {letterWarn && <Alert tone="warn">{letterWarn}</Alert>}
            {sel.acceptanceLetterNo ? (
              <div className="info-box">
                Belge no: <b>{sel.acceptanceLetterNo}</b>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                Belge numarası, depozito ödendikten sonra otomatik üretilir.
              </p>
            )}
            <Button
              icon="fileText"
              block
              disabled={busy || !!sel.acceptanceLetterNo}
              onClick={() => void issueLetter()}
            >
              {sel.acceptanceLetterNo ? 'Belge düzenlendi' : 'Resmi Kabul Belgesi Üret'}
            </Button>
          </>
        )}
      </Drawer>

      {/* Yeni kayıt */}
      <Drawer open={open} onClose={closeNew} title="Yeni uluslararası kabul kaydı">
        {formErr && <Alert tone="err">{formErr}</Alert>}

        <h2 style={{ marginTop: 0 }}>1 · Aday</h2>
        <div className="field">
          <label>Başvuru programı</label>
          <select
            value={programId}
            onChange={(e) => {
              setProgramId(e.target.value);
              setPicked(null);
            }}
          >
            {programs.length === 0 && <option value="">Program yükleniyor…</option>}
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {picked ? (
          <div className="info-box">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
              <span>
                <b>{picked.fullName}</b>
              </span>
              <Button variant="ghost" sm icon="refresh" onClick={() => setPicked(null)}>
                Değiştir
              </Button>
            </div>
          </div>
        ) : applicantsLoading ? (
          <Skeleton lines={4} />
        ) : applicants.length === 0 ? (
          <EmptyState
            icon="users"
            title="Aday bulunamadı"
            sub="Seçili başvuru programında aday kaydı yok."
          />
        ) : (
          <table>
            <tbody>
              {applicants.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.fullName}</b>
                  </td>
                  <td className="muted">{a.osymNo ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Button variant="ghost" sm icon="check" onClick={() => setPicked(a)}>
                      Seç
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>2 · Kabul bilgisi</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label>Ülke</label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Örn. Azerbaycan"
            />
          </div>

          <div className="field">
            <label>Depozito tutarı (TL)</label>
            <input
              value={depositTl}
              onChange={(e) => setDepositTl(e.target.value)}
              inputMode="decimal"
              placeholder="Örn. 15000,00"
            />
            <span className="muted" style={{ fontSize: 12 }}>
              {tlToKurus(depositTl) !== null ? money(tlToKurus(depositTl)) : 'Tutar girilmedi'}
            </span>
          </div>

          <div className="field">
            <label>Not</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Dosya ile ilgili açıklama"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="check" disabled={saving || !picked} block>
              {saving ? 'Kaydediliyor…' : 'Kaydı oluştur'}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
