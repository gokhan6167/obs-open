/**
 * RBAC + kaynak-bazlı yetki çekirdeği (master prompt §2). Saf ve test edilebilir.
 * Yetki kontrolü DAİMA backend'de; frontend gizlemesi güvenlik sayılmaz.
 *
 * Üç kilit:
 *  1) Tenant eşleşmesi — farklı tenant kaynağına erişim koşulsuz reddedilir (IDOR).
 *  2) Rol izni — actor'ın rollerinden en az biri bu kaynak+eylemi vermeli.
 *  3) Sahiplik — sahiplik-kapsamlı rollerde (örn. öğrenci kendi verisi, danışman
 *     kendi öğrencisi) sahiplik yüklemi de sağlanmalı.
 */
export type Action = 'read' | 'create' | 'update' | 'delete' | 'publish';

export interface Actor {
  userId: string;
  tenantId: string;
  roles: readonly string[];
}

export interface ResourceRef {
  type: string;
  tenantId: string;
  /** Kaynağın sahibi (örn. öğrencinin kendi kaydı). */
  ownerUserId?: string;
  /** Kaynağın danışmanı (danışman-öğrenci ilişkisi). */
  advisorUserId?: string;
}

/** role -> resourceType -> izin verilen eylemler. Tenant parametrik gelir. */
export type PermissionMatrix = Record<string, Record<string, readonly Action[]>>;

export interface AuthorizeConfig {
  matrix: PermissionMatrix;
  /** Bu roller yalnızca sahip oldukları/danışmanı oldukları kaynakta işlem yapar. */
  ownershipScopedRoles?: readonly string[];
}

function grantsAction(
  matrix: PermissionMatrix,
  role: string,
  resourceType: string,
  action: Action,
): boolean {
  return matrix[role]?.[resourceType]?.includes(action) ?? false;
}

function ownsResource(actor: Actor, resource: ResourceRef): boolean {
  return resource.ownerUserId === actor.userId || resource.advisorUserId === actor.userId;
}

export function authorize(
  actor: Actor,
  action: Action,
  resource: ResourceRef,
  config: AuthorizeConfig,
): boolean {
  // 1) Tenant izolasyonu — çapraz tenant erişimi asla.
  if (actor.tenantId !== resource.tenantId) {
    return false;
  }

  // 2) İzin veren rolleri bul.
  const grantingRoles = actor.roles.filter((r) =>
    grantsAction(config.matrix, r, resource.type, action),
  );
  if (grantingRoles.length === 0) {
    return false;
  }

  // 3) Sahiplik: izin yalnızca sahiplik-kapsamlı rollerden geldiyse, sahiplik şart.
  const ownershipScoped = new Set(config.ownershipScopedRoles ?? []);
  const hasUnscopedGrant = grantingRoles.some((r) => !ownershipScoped.has(r));
  if (hasUnscopedGrant) {
    return true;
  }
  return ownsResource(actor, resource);
}
