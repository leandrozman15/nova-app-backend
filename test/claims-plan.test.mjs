import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveClaimsPlan } from '../scripts/claims-plan.mjs';

const baseUser = {
  id: 'db-user-1',
  firebaseUid: 'firebase-user-1',
  email: 'user@example.test',
  name: 'Test User',
  companyId: 'company-1',
  role: 'user',
};

test('assigns company, role, and club from the only active ClubMembership', () => {
  const plan = deriveClaimsPlan({
    user: baseUser,
    previousClaims: { clubId: 'stale-club', role: 'old-role', customAccess: true },
    memberships: [{
      companyId: 'company-1',
      clubCompanyId: 'company-1',
      clubId: 'club-1',
      role: 'member',
      status: 'ACTIVA',
    }],
  });

  assert.equal(plan.status, 'READY');
  assert.deepEqual(plan.claims, {
    email: 'user@example.test',
    name: 'Test User',
    companyId: 'company-1',
    role: 'member',
    roles: ['member'],
    clubId: 'club-1',
    isFan: true,
  });
});

test('keeps an existing active club only when it matches one of the linked clubs', () => {
  const plan = deriveClaimsPlan({
    user: baseUser,
    previousClaims: { clubId: 'club-2' },
    memberships: [
      { companyId: 'company-1', clubCompanyId: 'company-1', clubId: 'club-1', role: 'coach', status: 'ACTIVA' },
      { companyId: 'company-1', clubCompanyId: 'company-1', clubId: 'club-2', role: 'member', status: 'ACTIVA' },
    ],
  });

  assert.equal(plan.status, 'READY');
  assert.equal(plan.claims.clubId, 'club-2');
  assert.equal(plan.claims.role, 'member');
});

test('clears club claims when multiple active memberships have no valid context', () => {
  const plan = deriveClaimsPlan({
    user: baseUser,
    previousClaims: { clubId: 'stale-club', companyId: 'company-1', role: 'coach' },
    memberships: [
      { companyId: 'company-1', clubCompanyId: 'company-1', clubId: 'club-1', role: 'coach', status: 'ACTIVA' },
      { companyId: 'company-1', clubCompanyId: 'company-1', clubId: 'club-2', role: 'member', status: 'ACTIVA' },
    ],
  });

  assert.equal(plan.status, 'READY');
  assert.equal(plan.reason, 'MULTIPLE_ACTIVE_CLUBS_WITHOUT_VALID_CONTEXT_CLAIMS_CLEARED');
  assert.deepEqual(plan.candidateClubIds, ['club-1', 'club-2']);
  assert.equal(plan.claims.clubId, undefined);
  assert.equal(plan.claims.role, undefined);
});

test('clears stale club claims for a free user with no active membership', () => {
  const plan = deriveClaimsPlan({
    user: baseUser,
    previousClaims: { companyId: 'company-1', clubId: 'old-club', role: 'member' },
  });

  assert.equal(plan.status, 'READY');
  assert.equal(plan.reason, 'NO_ACTIVE_MEMBERSHIP_CLAIMS_CLEARED');
  assert.deepEqual(plan.claims, { email: 'user@example.test', name: 'Test User' });
});

test('unscoped roles never receive a club claim', () => {
  const plan = deriveClaimsPlan({
    user: { ...baseUser, role: 'municipal_admin' },
    previousClaims: { clubId: 'stale-club', municipalityId: 'municipality-1' },
  });

  assert.equal(plan.status, 'READY');
  assert.equal(plan.claims.clubId, undefined);
  assert.equal(plan.claims.role, 'municipal_admin');
  assert.equal(plan.claims.companyId, 'company-1');
  assert.equal(plan.claims.municipalityId, 'municipality-1');
});

test('ignores inactive ClubMembership records and removes their old claims', () => {
  const plan = deriveClaimsPlan({
    user: baseUser,
    previousClaims: { companyId: 'company-1', clubId: 'club-1', role: 'member' },
    memberships: [{ companyId: 'company-1', clubCompanyId: 'company-1', clubId: 'club-1', role: 'member', status: 'BAJA' }],
  });

  assert.equal(plan.status, 'READY');
  assert.equal(plan.reason, 'NO_ACTIVE_MEMBERSHIP_CLAIMS_CLEARED');
  assert.equal(plan.claims.clubId, undefined);
});

test('clears club claims when membership company does not match the linked club', () => {
  const plan = deriveClaimsPlan({
    user: baseUser,
    memberships: [{
      companyId: 'company-1',
      clubCompanyId: 'company-2',
      clubId: 'club-2',
      role: 'member',
      status: 'ACTIVA',
    }],
  });

  assert.equal(plan.status, 'READY');
  assert.equal(plan.reason, 'NO_VALID_MEMBERSHIP_CLAIMS_CLEARED_COMPANY_MISMATCH');
  assert.equal(plan.claims.clubId, undefined);
});