'use client';
import { api } from '../../lib/api';

/**
 * Öğretim Elemanı panelinin paylaşılan not/ölçek yardımcıları.
 * Sadece app/hoca/ altında kullanılır; globals.css/lib DEĞİŞTİRİLMEZ.
 */

export interface Band {
  min: number;
  letter: string;
  coef: number;
}

export interface ActiveScale {
  code: string;
  name: string;
  evaluationType: string;
  bands: Band[];
}

/** Kurumun aktif ölçeği okunamazsa kullanılacak YÖK 4'lük mutlak tablosu. */
export const YOK_BANDS: Band[] = [
  { min: 90, letter: 'AA', coef: 4.0 },
  { min: 85, letter: 'BA', coef: 3.5 },
  { min: 80, letter: 'BB', coef: 3.0 },
  { min: 75, letter: 'CB', coef: 2.5 },
  { min: 65, letter: 'CC', coef: 2.0 },
  { min: 58, letter: 'DC', coef: 1.5 },
  { min: 50, letter: 'DD', coef: 1.0 },
  { min: 40, letter: 'FD', coef: 0.5 },
  { min: 0, letter: 'FF', coef: 0.0 },
];

/** Ham puanı verilen bant tablosuna göre harf + katsayıya çevir. */
export function toBand(bands: Band[], score: number): Band {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => score >= b.min) ?? sorted[sorted.length - 1]!;
}

/**
 * Aktif ölçeği çek; erişilemezse (yetki/veri) hardcoded YÖK tablosuna düş.
 * Böylece not önizlemesi kurumun gerçek ölçeğini yansıtır ama hiçbir zaman patlamaz.
 */
export async function loadScale(): Promise<ActiveScale> {
  try {
    const s = await api<ActiveScale>('/grades/active-scale');
    if (s && Array.isArray(s.bands) && s.bands.length > 0) return s;
  } catch {
    /* düş */
  }
  return { code: 'YOK4', name: 'YÖK 4\'lük (varsayılan)', evaluationType: 'absolute', bands: YOK_BANDS };
}

/** Not durum anahtarlarının Türkçe karşılıkları. */
export const GRADE_ST_TR: Record<string, string> = {
  draft: 'Taslak',
  submitted: 'Onaya gönderildi',
  announced: 'İlan edildi',
  finalized: 'Kesinleşti',
};

/** Not durumuna göre rozet sınıfı. */
export function gradeBadge(status: string | null): string {
  switch (status) {
    case 'announced':
    case 'finalized':
      return 'ok';
    case 'submitted':
      return 'warn';
    case 'draft':
      return 'muted';
    default:
      return 'muted';
  }
}

/** İçeriği kilitli (ilan sonrası) durumlar. */
export function isLocked(status: string | null): boolean {
  return status === 'announced' || status === 'finalized' || status === 'submitted';
}

export interface Section {
  id: string;
  code: string;
  courseCode: string;
  courseName: string;
  termName: string;
  quota: number;
  enrolled: number;
}

/** Şubenin kısa etiketi (select ve başlıklar için tutarlı). */
export function sectionLabel(s: Section): string {
  return `${s.courseCode} · ${s.courseName} — Şube ${s.code}`;
}

/** Gerçek roster satırı (enrollments join'li; portal/teaching'ten daha eksiksiz). */
export interface RosterRow {
  studentId: string;
  studentNo: string;
  fullName: string;
  componentScores: { componentId: string; score: number }[];
  gradeId: string | null;
  rawScore: number | null;
  letter: string | null;
  coefficient: number | null;
  status: string | null;
}

export interface GradeComponent {
  id: string;
  name: string;
  weight: number;
  locked: boolean;
}
