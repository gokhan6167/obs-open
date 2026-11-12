'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, Badge, Button, Alert, EmptyState, ProgressBar,
  Skeleton, toast,
} from '@/app/ui';

interface Me {
  student?: { id: string };
}
interface Sec {
  id: string;
  courseCode: string;
  courseName: string;
  ects: number;
  localCredit: number;
  sectionCode: string;
  quota: number;
  filled: number;
}
interface Term {
  id: string;
  name: string;
}
interface Win {
  type: string;
  startsAt: string;
  endsAt: string;
}
interface Draft {
  enrollmentId: string;
  courseCode: string;
  courseName: string;
  ects: number;
  localCredit: number;
}

const ECTS_CAP = 30; // dönemlik AKTS tavanı (client-side uyarı; sunucu da denetler)

export default function DersSecme(): React.ReactElement {
  const [studentId, setStudentId] = useState('');
  const [secs, setSecs] = useState<Sec[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [enrollWin, setEnrollWin] = useState<Win | null>(null);
  const [cart, setCart] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);

  const load = useCallback(async () => {
    const [m, s, t] = await Promise.all([
      api<Me>('/portal/me'),
      api<Sec[]>('/portal/available-sections'),
      api<Term | null>('/calendar/active-term'),
    ]);
    setStudentId(m.student?.id ?? '');
    setSecs(s);
    setTerm(t);
    if (t?.id) {
      try {
        const w = await api<Win[]>(`/calendar/terms/${t.id}/windows`);
        setEnrollWin(w.find((x) => x.type === 'kayit') ?? null);
      } catch {
        setEnrollWin(null);
      }
    }
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const now = Date.now();
  const windowOpen =
    enrollWin != null &&
    now >= Date.parse(enrollWin.startsAt) &&
    now <= Date.parse(enrollWin.endsAt);

  const cartSecs = useMemo(() => secs.filter((s) => cart.includes(s.id)), [secs, cart]);
  const cartEcts = cartSecs.reduce((a, s) => a + s.ects, 0);
  const cartCredit = cartSecs.reduce((a, s) => a + (s.localCredit ?? 0), 0);
  const dupCourse = useMemo(() => {
    const codes = cartSecs.map((s) => s.courseCode);
    return codes.filter((c, i) => codes.indexOf(c) !== i);
  }, [cartSecs]);
  const overCap = cartEcts > ECTS_CAP;
  const fullInCart = useMemo(() => cartSecs.filter((s) => s.filled >= s.quota), [cartSecs]);

  // Kesinleştirme öncesi client-side ön-kontrol raporu (sunucu da denetler).
  const checks = useMemo(() => {
    const rows: { ok: boolean; label: string }[] = [];
    rows.push(
      cart.length === 0
        ? { ok: false, label: 'Sepet boş — en az bir şube seçin.' }
        : { ok: true, label: `Sepette ${cart.length} şube var.` },
    );
    rows.push(
      overCap
        ? { ok: false, label: `AKTS tavanı aşıldı (${cartEcts} > ${ECTS_CAP}).` }
        : { ok: true, label: `AKTS toplamı uygun (${cartEcts} / ${ECTS_CAP}).` },
    );
    rows.push(
      dupCourse.length > 0
        ? { ok: false, label: `Aynı dersten birden fazla şube: ${dupCourse.join(', ')}.` }
        : { ok: true, label: 'Aynı derse ait çift şube yok.' },
    );
    rows.push(
      fullInCart.length > 0
        ? { ok: false, label: `Dolu şube seçili: ${fullInCart.map((s) => `${s.courseCode}/${s.sectionCode}`).join(', ')}.` }
        : { ok: true, label: 'Seçili şubelerde kontenjan var.' },
    );
    return rows;
  }, [cart.length, overCap, cartEcts, dupCourse, fullInCart]);
  const checkPass = checks.every((c) => c.ok);

  const draftCredit = drafts.reduce((a, d) => a + (d.localCredit ?? 0), 0);
  const draftEcts = drafts.reduce((a, d) => a + (d.ects ?? 0), 0);

  function toggle(id: string): void {
    setChecked(false); // sepet değişti → önceki kontrol raporu geçersiz
    setCart((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  // Kesinleştirme öncesi kural raporunu göster.
  function runChecks(): void {
    setChecked(true);
    if (checkPass) toast('Kontrol tamam', { tone: 'ok', body: 'Tüm kurallar uygun, taslak kaydedebilirsiniz.' });
    else toast('Kontrol: sorun var', { tone: 'err', body: 'Rapordaki uyarıları giderin.' });
  }

  // 1. adım: sepeti taslak kayda çevir (enroll → draft). enrollmentId'leri sakla.
  async function saveCart(): Promise<void> {
    if (cart.length === 0 || !studentId) return;
    setBusy(true);
    setMsg('');
    setErr('');
    const added: Draft[] = [];
    const ok: string[] = [];
    const fail: string[] = [];
    for (const sectionId of cart) {
      const s = secs.find((x) => x.id === sectionId);
      try {
        const r = await api<{ enrollmentId: string }>('/enrollment/enroll', {
          method: 'POST',
          body: { studentId, sectionId },
        });
        ok.push(sectionId);
        if (s) added.push({ enrollmentId: r.enrollmentId, courseCode: s.courseCode, courseName: s.courseName, ects: s.ects, localCredit: s.localCredit });
      } catch (e) {
        fail.push(`${s?.courseCode ?? sectionId}: ${e instanceof Error ? e.message : 'hata'}`);
      }
    }
    setBusy(false);
    setDrafts((d) => [...d, ...added]);
    setCart(fail.length ? cart.filter((id) => !ok.includes(id)) : []);
    if (ok.length) {
      setMsg(`${ok.length} ders taslak olarak kaydedildi. Danışman onayına göndermeyi unutmayın.`);
      toast('Taslak kaydedildi', { tone: 'ok', body: `${ok.length} şube · sıradaki adım: danışmana gönder.` });
    }
    if (fail.length) {
      setErr(`Kaydedilemedi — ${fail.join(' · ')}`);
      toast('Bazı dersler kaydedilemedi', { tone: 'err', body: `${fail.length} şube reddedildi.` });
    }
    await load();
  }

  // 2. adım: taslak kayıtları danışman onayına gönder (transition → submitted).
  async function sendToAdvisor(): Promise<void> {
    if (drafts.length === 0) return;
    setSending(true);
    setErr('');
    const ok: string[] = [];
    const fail: string[] = [];
    for (const d of drafts) {
      try {
        await api(`/enrollment/${d.enrollmentId}/transition`, { method: 'POST', body: { to: 'submitted' } });
        ok.push(d.enrollmentId);
      } catch (e) {
        fail.push(`${d.courseCode}: ${e instanceof Error ? e.message : 'hata'}`);
      }
    }
    setSending(false);
    setDrafts((ds) => ds.filter((d) => !ok.includes(d.enrollmentId)));
    if (ok.length) {
      setMsg(`${ok.length} ders danışman onayına gönderildi. Danışmanınız onayladığında kaydınız kesinleşir.`);
      toast('Danışmana gönderildi', { tone: 'ok', body: `${ok.length} ders onay kuyruğunda.` });
    }
    if (fail.length) setErr(`Gönderilemedi — ${fail.join(' · ')}`);
  }

  return (
    <>
      <PageHeader
        title="Ders Kayıt"
        sub={`${term ? term.name : 'Aktif dönem'} · Şube seç → taslak kaydet → danışmana gönder.`}
        actions={<Button variant="ghost" icon="refresh" sm onClick={() => load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))}>Yenile</Button>}
      />

      <Card>
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <Badge tone={windowOpen ? 'ok' : 'danger'}>
            {enrollWin ? (windowOpen ? 'Kayıt penceresi AÇIK' : 'Kayıt penceresi KAPALI') : 'Pencere tanımlı değil'}
          </Badge>
          {enrollWin && (
            <span className="muted">
              {new Date(enrollWin.startsAt).toLocaleString('tr-TR')} — {new Date(enrollWin.endsAt).toLocaleString('tr-TR')}
            </span>
          )}
        </div>
      </Card>

      {msg && <Alert tone="ok">{msg}</Alert>}
      {err && <Alert tone="err">{err}</Alert>}

      {/* Adım göstergesi */}
      <Card>
        <div className="row" style={{ gap: 8, fontSize: 13, color: 'var(--muted)' }}>
          <span className="chip"><b>1</b> Şube seç</span>
          <span>→</span>
          <span className="chip"><b>2</b> Taslak kaydet</span>
          <span>→</span>
          <span className="chip"><b>3</b> Danışmana gönder</span>
          <span>→</span>
          <span className="chip">Danışman onayı</span>
        </div>
      </Card>

      {/* Taslak kayıtlar — danışmana gönder */}
      {drafts.length > 0 && (
        <Card icon="clock" title="Taslak Kayıtlar (danışmana gönderilmedi)">
          <StatGrid
            stats={[
              { label: 'Taslak ders', value: drafts.length, icon: 'book' },
              { label: 'Kredi', value: draftCredit, icon: 'grade' },
              { label: 'AKTS', value: draftEcts, icon: 'layers' },
            ]}
          />
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <thead><tr><th>Ders</th><th className="num">Kredi</th><th className="num">AKTS</th><th>Durum</th></tr></thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.enrollmentId}>
                    <td><b>{d.courseCode}</b> · {d.courseName}</td>
                    <td className="num">{d.localCredit}</td>
                    <td className="num">{d.ects}</td>
                    <td><Badge tone="muted">Taslak</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="primary" icon="arrowRight" onClick={sendToAdvisor} disabled={sending}>
            {sending ? 'Gönderiliyor…' : `Danışman onayına gönder (${drafts.length})`}
          </Button>
        </Card>
      )}

      {/* Sepet */}
      <Card icon="inbox" title="Sepetim">
        {cart.length === 0 ? (
          <EmptyState icon="inbox" title="Sepet boş" sub="Aşağıdaki açık şubelerden seçim yaparak sepete ekleyin." />
        ) : (
          <>
            <StatGrid
              stats={[
                { label: 'Ders', value: cart.length, icon: 'book' },
                { label: 'Kredi', value: cartCredit, icon: 'grade' },
                { label: `AKTS (tavan ${ECTS_CAP})`, value: cartEcts, icon: 'layers', tone: overCap ? 'danger' : undefined },
              ]}
            />
            {overCap && <Alert tone="err">AKTS tavanı aşıldı ({cartEcts} &gt; {ECTS_CAP}). Sepetten ders çıkarın.</Alert>}
            {dupCourse.length > 0 && <Alert tone="err">Çakışma: aynı dersten birden fazla şube seçili — {dupCourse.join(', ')}.</Alert>}

            {checked && (
              <div style={{ marginTop: 8 }}>
                <Alert tone={checkPass ? 'ok' : 'err'}>
                  {checkPass ? 'Ön-kontrol geçti: taslak kaydetmeye hazır.' : 'Ön-kontrolde sorun bulundu. Aşağıdaki uyarıları giderin.'}
                </Alert>
                <ul className="list" style={{ margin: '8px 0 0', paddingLeft: 0 }}>
                  {checks.map((c, i) => (
                    <li key={i} className="list-item" style={{ justifyContent: 'flex-start', gap: 10 }}>
                      <Badge tone={c.ok ? 'ok' : 'danger'}>{c.ok ? 'Uygun' : 'Sorun'}</Badge>
                      <span className={c.ok ? undefined : 'muted'}>{c.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="row" style={{ alignItems: 'center', marginTop: 8, gap: 8 }}>
              <Button variant="subtle" icon="shield" onClick={runChecks}>
                Kontrol Et
              </Button>
              <Button variant="ok" icon="check" onClick={saveCart} disabled={busy || !windowOpen}>
                {busy ? 'Kaydediliyor…' : `Taslak kaydet (${cart.length})`}
              </Button>
              {!windowOpen && <span className="muted">Kayıt penceresi kapalıyken kaydedilemez.</span>}
            </div>
          </>
        )}
      </Card>

      {/* Açık şubeler */}
      <Card icon="grid" title="Açık Şubeler">
        {loading ? (
          <Skeleton lines={5} />
        ) : secs.length === 0 ? (
          <EmptyState icon="grid" title="Seçilebilir açık şube kalmadı" sub="Şu an kaydolabileceğiniz açık şube bulunmuyor." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Ders</th><th>Şube</th><th className="num">Kredi</th><th className="num">AKTS</th><th>Doluluk</th><th></th></tr>
              </thead>
              <tbody>
                {secs.map((s) => {
                  const rate = s.quota > 0 ? Math.round((s.filled / s.quota) * 100) : 100;
                  const full = s.filled >= s.quota;
                  const inCart = cart.includes(s.id);
                  return (
                    <tr key={s.id}>
                      <td><b>{s.courseCode}</b> · {s.courseName}</td>
                      <td>{s.sectionCode}</td>
                      <td className="num">{s.localCredit}</td>
                      <td className="num">{s.ects}</td>
                      <td>
                        <div style={{ width: 140 }}>
                          <ProgressBar value={rate} tone={full ? 'danger' : rate > 80 ? 'warn' : undefined} />
                          <span className="meta">{s.filled}/{s.quota} (%{rate})</span>
                        </div>
                      </td>
                      <td>
                        <Button variant={inCart ? 'danger' : 'subtle'} sm icon={inCart ? 'x' : 'check'} disabled={full && !inCart} onClick={() => toggle(s.id)}>
                          {inCart ? 'Çıkar' : full ? 'Dolu' : 'Sepete ekle'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
