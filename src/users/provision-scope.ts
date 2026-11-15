const MUNICIPAL_ROLES = new Set(['municipal_secretary', 'municipal_admin', 'municipal_inspector']);

/** Roles globales que cada autoridad (no plataforma) puede otorgar. */
export function canAssignGlobalRole(actorRole: string, targetRole: string): boolean {
  if (MUNICIPAL_ROLES.has(actorRole)) return MUNICIPAL_ROLES.has(targetRole);
  if (actorRole === 'league_admin') return targetRole === 'league_admin';
  return false;
}
