'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, currentRoles } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Button,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonStats,
  toast,
} from '@/app/ui';
import {
  type ActiveScale,
  type RosterRow,
  type Section,
  loadScale,
  toBand,
} from '../_grades';

export default function NotDuzeltme(): React.ReactElement {
  const [secs, setSecs] = useState<Section[] | null>(null);
  const [sel, setSel] = useState('');
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [scale, setScale] = useState<ActiveScale | null>(null);
  const [target, setTarget] = useState<RosterRow | null>(null);
  const [newRaw, setNewRaw] = useState('');
  const [reason, setReason] = useState('');
  const [decisionNo, setDecisionNo] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  // İlan sonrası not düzeltme backend'de yalnızca OİDB/sistem yöneticisi yetkisiyle
  // yapılır (grades.service.applyCorrection). Saf öğretim elemanı/danışman düzeltme
  // uygulayamaz; ona düzeltme formu yerine kilit bilgisi gösterilir.
  const [canCorrect, setCanCorrect] = useState(false);

  useEffect(() => {
    const roles = currentRoles();
    setCanCorrect(roles.includes('oidb') || roles.includes('sistem_yoneticisi'));
  }, []);

  useEffect(() => {
    (async () => {
      const [teaching, sc] = await Promise.all([api<Section[]>('/portal/teaching'), loadScale()]);
      setSecs(teaching);
      setScale(sc);
      if (teaching.length > 0) setSel(teaching[0].id);
    })().catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'));
  }, []);

  const loadRoster = useCallback(async (sectionId: string) => {
    setLoadingRoster(true);
    setErr('');
    setRoster(null);
    setTarget(null);
    try {
      const r = await api<{ items: RosterRow[] }>(`/grades/sections/${sectionId}/roster`);
      setRoster(r.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Şube listesi yüklenemedi');
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  useEffect(() => {
    if (sel) void loadRoster(sel);
  }, [sel, loadRoster]);

  const current = useMemo(() => secs?.find((s) => s.id === sel) ?? null, [secs, sel]);
  const ilanEdilmis = useMemo(
    () =>
      (roster ?? []).filter(
        (r) => r.gradeId && (r.status === 'announced' || r.status === 'finalized'),
      ),
    [roster],
  );

  const bands = scale?.bands ?? [];
  const rawNum = Number(newRaw);
  const validRaw = newRaw.trim() !== '' && !Number.isNaN(rawNum) && rawNum >= 0 && rawNum <= 100;
  const band = validRaw ? toBand(bands, rawNum) : null;

  function pick(r: RosterRow): void {
    setTarget(r);
    setNewRaw(r.rawScore !== null ? String(r.rawScore) : '');
    setReason('');
    setDecisionNo('');
    setMsg('');
    setErr('');
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMsg('');
    setErr('');
    if (!canCorrect)
      return setErr('İlan edilmiş not düzeltme yetkiniz yok (ÖİDB/sistem yöneticisi gerekir).');
    if (!target?.gradeId) return setErr('Önce düzeltilecek notu tablodan seçin.');
    if (!band) return setErr('Geçerli bir yeni ham puan (0-100) girin.');
    if (!decisionNo.trim()) return setErr('Kurul/Karar numarası zorunludur.');
    if (!reason.trim()) return setErr('Gerekçe zorunludur.');
    setBusy(true);
    try {
      await api(`/grades/${target.gradeId}/correction`, {
        method: 'POST',
        body: {
          newRaw: rawNum,
          newLetter: band.letter,
          newCoefficient: band.coef,
          reason: reason.trim(),
          decisionNo: decisionNo.trim(),
        },
      });
      const m = `${target.studentNo} notu düzeltildi ve denetim kaydına (audit) yazıldı. Yeni harf: ${band.letter}.`;
      setMsg(m);
      toast('Not düzeltildi', { tone: 'ok', body: m });
      setTarget(null);
      setNewRaw('');
      setReason('');
      setDecisionNo('');
      await loadRoster(sel);
    } catch (er) {
      const m = er instanceof Error ? er.message : 'Düzeltme başarısız';
      setErr(m);
      toast('Düzeltme başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  if (err && !secs) {
    return (
      <>
        <PageHeader title="Not Düzeltme" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }

  if (!secs) {
    return (
      <>
        <PageHeader title="Not Düzeltme" />
        <SkeletonStats n={3} />
        <Card>
          <Skeleton lines={6} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Not Düzeltme"
        sub={
          canCorrect
            ? 'İlan edilmiş bir notu yalnızca gerekçe ve kurul/karar numarasıyla düzeltebilirsiniz. Her düzeltme denetim kaydına işlenir; sessiz değişiklik teknik olarak engellenir.'
            : 'Şubenizin ilan edilmiş notları. Bu notlar kilitlidir; düzeltme yetkisi ÖİDB/sistem yöneticisindedir. Her düzeltme denetim kaydına işlenir; sessiz değişiklik teknik olarak engellenir.'
        }
      />

      {msg && <Alert tone="ok">{msg}</Alert>}
      {err && secs && <Alert tone="err">{err}</Alert>}

      <Alert tone="info">
        Not girişi ekranında girilen taslak notlar serbestçe değişebilir. Bu ekran yalnızca{' '}
        <b>ilan edilmiş (announced/finalized)</b> notlar içindir.
        {canCorrect ? (
          <> Düzeltilecek notu tablodan seçin; düzeltme karar no + gerekçe ile denetim kaydına işlenir.</>
        ) : (
          <>
            {' '}
            İlan edilmiş notlar kilitlidir ve <b>yalnızca ÖİDB/sistem yöneticisi</b> tarafından kurul
            kararıyla düzeltilebilir. Aşağıda şubenizin ilan edilmiş notlarını görüntüleyebilir; bir
            düzeltme gerekiyorsa ÖİDB&apos;ye başvurabilirsiniz.
          </>
        )}
      </Alert>

      {secs.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Atanmış şube görünmüyor"
          sub="Bu dönem size atanmış şube bulunmuyor."
        />
      ) : (
        <>
          <StatGrid
            stats={[
              {
                label: 'İlan Edilmiş Not',
                value: ilanEdilmis.length,
                icon: 'checkCircle',
                tone: 'ok',
              },
              {
                label: 'Düzeltme Yetkisi',
                value: canCorrect ? 'Var' : 'Yok',
                icon: 'shield',
                tone: canCorrect ? 'ok' : 'warn',
              },
              {
                label: 'Seçili Kayıt',
                value: target ? target.studentNo : '—',
                icon: 'flag',
              },
            ]}
          />

          <Card
            title={`İlan edilmiş notlar${current ? ` — ${current.courseCode} Şube ${current.code}` : ''}`}
            icon="grade"
            actions={
              <div className="field" style={{ margin: 0 }}>
                <select value={sel} onChange={(e) => setSel(e.target.value)}>
                  {secs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.courseCode} · {s.courseName} — Şube {s.code}
                    </option>
                  ))}
                </select>
              </div>
            }
          >
            {loadingRoster ? (
              <Skeleton lines={5} />
            ) : ilanEdilmis.length === 0 ? (
              <EmptyState
                icon="grade"
                title="İlan edilmiş not yok"
                sub="Bu şubede ilan edilmiş not yok; düzeltilecek kayıt bulunmuyor."
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Öğrenci No</th>
                    <th>Ad Soyad</th>
                    <th>Ham Puan</th>
                    <th>Harf</th>
                    <th>Durum</th>
                    {canCorrect && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {ilanEdilmis.map((r) => {
                    const secili = target?.gradeId === r.gradeId;
                    return (
                      <tr key={r.gradeId} style={{ background: secili ? 'var(--okbg)' : undefined }}>
                        <td>{r.studentNo}</td>
                        <td>{r.fullName}</td>
                        <td>{r.rawScore ?? '—'}</td>
                        <td>{r.letter ? <Badge tone="muted">{r.letter}</Badge> : '—'}</td>
                        <td>
                          <Badge tone="ok">
                            {r.status === 'finalized' ? 'Kesinleşti' : 'İlan edildi'}
                          </Badge>
                        </td>
                        {canCorrect && (
                          <td>
                            <Button
                              variant={secili ? 'primary' : 'ghost'}
                              sm
                              icon={secili ? 'check' : 'edit'}
                              onClick={() => pick(r)}
                            >
                              {secili ? 'Seçildi' : 'Düzelt'}
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          {canCorrect && target && (
            <Card title="Düzeltme talebi" icon="edit">
              <p className="hint">
                Öğrenci: <b>{target.fullName}</b> ({target.studentNo}) · Mevcut:{' '}
                {target.rawScore ?? '—'} / {target.letter ?? '—'}
              </p>
              <form onSubmit={submit}>
                <div className="field">
                  <label>Yeni ham puan (0-100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={newRaw}
                    onChange={(e) => setNewRaw(e.target.value)}
                    required
                  />
                  {band && (
                    <p className="hint">
                      Yeni harf: <b>{band.letter}</b> · katsayı {band.coef.toFixed(1)}
                      {target.letter && target.letter !== band.letter && (
                        <Badge tone="warn">
                          {target.letter} → {band.letter}
                        </Badge>
                      )}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label>Kurul/Karar numarası</label>
                  <input
                    value={decisionNo}
                    onChange={(e) => setDecisionNo(e.target.value)}
                    placeholder="örn. FYK 2026/14"
                    required
                  />
                </div>
                <div className="field">
                  <label>Gerekçe</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    required
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
                <div className="row" style={{ gap: 8 }}>
                  <Button variant="danger" icon="check" type="submit" disabled={busy}>
                    {busy ? 'Gönderiliyor…' : 'Düzeltmeyi uygula'}
                  </Button>
                  <Button variant="ghost" type="button" onClick={() => setTarget(null)}>
                    Vazgeç
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </>
      )}
    </>
  );
}
