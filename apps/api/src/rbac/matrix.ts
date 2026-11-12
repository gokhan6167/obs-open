import type { AuthorizeConfig, PermissionMatrix } from './authorize.js';

/**
 * OBS varsayılan izin matrisi. Bu bir VARSAYILAN'dır; ileride tenant bazlı
 * özelleştirilebilir (parametrik). Kaynak-eylem izinleri backend'de zorlanır.
 *
 * ownershipScopedRoles: bu roller yalnızca sahip/danışmanı oldukları kaynakta işlem yapar.
 */
const MATRIX: PermissionMatrix = {
  sistem_yoneticisi: {
    student: ['read', 'create', 'update'],
    curriculum: ['read', 'create', 'update'],
    calendar: ['read', 'create', 'update'],
  },
  oidb: {
    student: ['read', 'create', 'update'],
    curriculum: ['read'],
    calendar: ['read', 'create', 'update'],
  },
  danisman: {
    student: ['read'],
    curriculum: ['read'],
    calendar: ['read'],
  },
  ogretim_elemani: {
    curriculum: ['read'],
    calendar: ['read'],
  },
  ogrenci: {
    student: ['read'],
    curriculum: ['read'],
    calendar: ['read'],
  },
};

export const OBS_AUTHORIZE_CONFIG: AuthorizeConfig = {
  matrix: MATRIX,
  ownershipScopedRoles: ['ogrenci', 'danisman'],
};
