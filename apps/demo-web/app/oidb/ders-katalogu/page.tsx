'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Button,
  Drawer,
  Alert,
  Skeleton,
  EmptyState,
  toast,
} from '@/app/ui';

interface Course {
  id: string;
  code: string;
  nameTr: string;
  ects: number;
  localCredit: number;
}

export default function DersKatalogu(): React.ReactElement {
  const [courses, setCourses] = useState<Course[]>([]);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Yeni ders paneli
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [nameTr, setNameTr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [ects, setEcts] = useState('6');
  const [localCredit, setLocalCredit] = useState('3');
  const [theoryHours, setTheoryHours] = useState('3');
  const [practiceHours, setPracticeHours] = useState('0');
  const [labHours, setLabHours] = useState('0');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const c = await api<Course[]>('/courses');
    setCourses(c ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  const openPanel = useCallback(() => {
    setCode('');
    setNameTr('');
    setNameEn('');
    setEcts('6');
    setLocalCredit('3');
    setTheoryHours('3');
    setPracticeHours('0');
    setLabHours('0');
    setOpen(true);
  }, []);

  const createCourse = useCallback(async () => {
    const e = Number(ects);
    const lc = Number(localCredit);
    const th = Number(theoryHours);
    const ph = Number(practiceHours);
    const lh = Number(labHours);
    if (
      !code.trim() ||
      !nameTr.trim() ||
      !nameEn.trim() ||
      !Number.isFinite(e) ||
      e <= 0 ||
      !Number.isFinite(lc) ||
      lc <= 0 ||
      !Number.isInteger(th) ||
      th < 0 ||
      !Number.isInteger(ph) ||
      ph < 0 ||
      !Number.isInteger(lh) ||
      lh < 0
    ) {
      toast('Eksik bilgi', {
        tone: 'err',
        body: 'Kod, Türkçe/İngilizce ad, AKTS ve kredi zorunludur; saatler negatif olamaz.',
      });
      return;
    }
    setSaving(true);
    try {
      await api('/courses', {
        method: 'POST',
        body: {
          code: code.trim(),
          nameTr: nameTr.trim(),
          nameEn: nameEn.trim(),
          ects: e,
          localCredit: lc,
          theoryHours: th,
          practiceHours: ph,
          labHours: lh,
        },
      });
      toast('Ders eklendi', { tone: 'ok', body: `${code.trim()} · ${nameTr.trim()}` });
      setOpen(false);
      await load();
    } catch (ex) {
      toast('Ders eklenemedi', { tone: 'err', body: ex instanceof Error ? ex.message : 'Hata' });
    } finally {
      setSaving(false);
    }
  }, [code, nameTr, nameEn, ects, localCredit, theoryHours, practiceHours, labHours, load]);

  const totalEcts = courses.reduce((s, c) => s + (c.ects ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Ders Kataloğu"
        sub="Kurum genelinde tanımlı derslerin merkezi kataloğu."
        actions={
          <Button icon="plus" onClick={openPanel}>
            Yeni Ders
          </Button>
        }
      />

      {err ? (
        <Alert tone="err">{err}</Alert>
      ) : !loaded ? (
        <Skeleton lines={8} />
      ) : courses.length === 0 ? (
        <EmptyState
          icon="book"
          title="Katalogda ders yok"
          sub="İlk dersi eklemek için “Yeni Ders” düğmesini kullanın."
          action={
            <Button icon="plus" onClick={openPanel}>
              Yeni Ders
            </Button>
          }
        />
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Ders Sayısı', value: String(courses.length) },
              { label: 'Toplam AKTS', value: String(totalEcts) },
            ]}
          />
          <Card title="Dersler" icon="book">
            <DataTable
              rows={courses}
              csv
              csvName="ders-katalogu"
              columns={[
                { key: 'code', header: 'Kod', sortable: true, value: (r) => r.code },
                { key: 'nameTr', header: 'Ders Adı', sortable: true, value: (r) => r.nameTr },
                { key: 'ects', header: 'AKTS', num: true, sortable: true, value: (r) => r.ects },
                {
                  key: 'localCredit',
                  header: 'Yerel Kredi',
                  num: true,
                  sortable: true,
                  value: (r) => r.localCredit,
                },
              ]}
            />
          </Card>
        </>
      )}

      {/* Yeni ders */}
      <Drawer open={open} onClose={() => setOpen(false)} title="Yeni Ders">
        <div className="field">
          <label>Kod</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="örn. BIL101"
            maxLength={20}
          />
        </div>
        <div className="field">
          <label>Ders Adı (Türkçe)</label>
          <input
            value={nameTr}
            onChange={(e) => setNameTr(e.target.value)}
            placeholder="örn. Bilgisayar Programlamaya Giriş"
            maxLength={200}
          />
        </div>
        <div className="field">
          <label>Ders Adı (İngilizce)</label>
          <input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="örn. Introduction to Computer Programming"
            maxLength={200}
          />
        </div>
        <div className="field">
          <label>AKTS</label>
          <input
            type="number"
            min={1}
            max={60}
            value={ects}
            onChange={(e) => setEcts(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Yerel Kredi</label>
          <input
            type="number"
            min={0}
            max={30}
            step={0.5}
            value={localCredit}
            onChange={(e) => setLocalCredit(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Teorik Saat</label>
          <input
            type="number"
            min={0}
            max={40}
            value={theoryHours}
            onChange={(e) => setTheoryHours(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Uygulama Saati</label>
          <input
            type="number"
            min={0}
            max={40}
            value={practiceHours}
            onChange={(e) => setPracticeHours(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Laboratuvar Saati</label>
          <input
            type="number"
            min={0}
            max={40}
            value={labHours}
            onChange={(e) => setLabHours(e.target.value)}
          />
        </div>
        <Button block icon="check" onClick={createCourse} disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Dersi Ekle'}
        </Button>
      </Drawer>
    </>
  );
}
