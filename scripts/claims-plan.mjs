const GLOBAL_ROLES = new Set([
  'admin',
  'fed_admin',
  'league_admin',
  'municipal_secretary',
  'municipal_admin',
  'municipal_inspector',
]);

const CLUB_SCOPED_ROLES = new Set([
  'club_admin',
  'manager',
  'coordinator',
  'coach_lvl1',
  'coach_lvl2',
  'coach',
  'player',
  'member',
]);

const CLAIMS_MANAGED_BY_BACKFILL = new Set([
  'companyId',
  'clubId',
  'role',
  'roles',
  'isAdmin',
]);

function makeClaims(user, { companyId, clubId, role } = {}, previousClaims = {}) {
  const claims = {
    email: user.email,
    name: user.name ?? undefined,
    ...(companyId ? { companyId } : {}),
    ...(clubId ? { clubId } : {}),
    ...(role ? { role, roles: [role] } : {}),
    ...(role === 'member' ? { isFan: true } : {}),
    ...(['municipal_admin', 'municipal_secretary', 'municipal_inspector'].includes(role) &&
        typeof previousClaims.municipalityId === 'string'
      ? { municipalityId: previousClaims.municipalityId }
      : {}),
    ...(role === 'league_admin' && typeof previousClaims.leagueId === 'string'
      ? { leagueId: previousClaims.leagueId }
      : {}),
  };
  Object.keys(claims).forEach((key) => {
    if (claims[key] === undefined) delete claims[key];
  });
  return claims;
}

export function deriveClaimsPlan({ user, previousClaims = {}, memberships = [] }) {
  const role = typeof user.role === 'string' ? user.role.trim().toLowerCase() : '';
  const base = {
    firebaseUid: user.firebaseUid,
    email: user.email,
    companyId: user.companyId,
    role: user.role,
    candidateClubIds: [],
    claims: null,
    reason: null,
  };

  if (GLOBAL_ROLES.has(role)) {
    if (!user.companyId) {
      return { ...base, status: 'BLOCKED', reason: 'GLOBAL_USER_MISSING_COMPANY' };
    }
    return {
      ...base,
      status: 'READY',
      reason: 'UNSCOPED_ROLE_USES_API_FOR_GLOBAL_ACCESS',
      claims: makeClaims(user, { companyId: user.companyId, role }, previousClaims),
    };
  }

  const activeMemberships = memberships.filter((membership) => membership.status === 'ACTIVA');
  const validMemberships = activeMemberships.filter((membership) =>
    membership.companyId === user.companyId &&
    membership.clubCompanyId === membership.companyId &&
    CLUB_SCOPED_ROLES.has(String(membership.role).trim().toLowerCase()),
  );
  const candidateClubIds = [...new Set(validMemberships.map((membership) => membership.clubId))].sort();

  if (candidateClubIds.length === 0) {
    const hasCompanyMismatch = activeMemberships.some((membership) =>
      membership.companyId !== user.companyId || membership.clubCompanyId !== membership.companyId,
    );
    const hasUnsupportedRole = activeMemberships.some((membership) =>
      !CLUB_SCOPED_ROLES.has(String(membership.role).trim().toLowerCase()),
    );
    return {
      ...base,
      status: 'READY',
      reason: hasCompanyMismatch
        ? 'NO_VALID_MEMBERSHIP_CLAIMS_CLEARED_COMPANY_MISMATCH'
        : hasUnsupportedRole
          ? 'NO_VALID_MEMBERSHIP_CLAIMS_CLEARED_UNSUPPORTED_ROLE'
          : 'NO_ACTIVE_MEMBERSHIP_CLAIMS_CLEARED',
      candidateClubIds,
      claims: makeClaims(user),
    };
  }

  let selectedMembership;
  if (candidateClubIds.length === 1) {
    selectedMembership = validMemberships.find((membership) => membership.clubId === candidateClubIds[0]);
  } else if (candidateClubIds.includes(previousClaims.clubId)) {
    selectedMembership = validMemberships.find((membership) => membership.clubId === previousClaims.clubId);
  } else {
    return {
      ...base,
      status: 'READY',
      reason: 'MULTIPLE_ACTIVE_CLUBS_WITHOUT_VALID_CONTEXT_CLAIMS_CLEARED',
      candidateClubIds,
      claims: makeClaims(user),
    };
  }

  const membershipRole = selectedMembership.role.trim().toLowerCase();
  return {
    ...base,
    status: 'READY',
    candidateClubIds,
    reason: null,
    claims: makeClaims(user, {
      companyId: selectedMembership.companyId,
      clubId: selectedMembership.clubId,
      role: membershipRole,
    }),
  };
}