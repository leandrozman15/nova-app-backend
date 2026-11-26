export const MUNICIPAL_ROLES = new Set(['municipal_secretary', 'municipal_admin', 'municipal_inspector']);

/** Roles globales que cada autoridad (no plataforma) puede otorgar. */
export function canAssignGlobalRole(actorRole: string, targetRole: string): boolean {
  // El municipio da de alta a las autoridades de sus ligas (el alcance a su propia empresa/ligas se verifica aparte).
  if (MUNICIPAL_ROLES.has(actorRole)) return MUNICIPAL_ROLES.has(targetRole) || targetRole === 'league_admin';
  if (actorRole === 'league_admin') return targetRole === 'league_admin';
  return false;
}
