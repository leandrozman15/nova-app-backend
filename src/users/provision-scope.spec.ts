import { canAssignGlobalRole } from './provision-scope';

describe('canAssignGlobalRole', () => {
  it('municipio solo crea perfiles municipales', () => {
    for (const a of ['municipal_secretary', 'municipal_admin']) {
      expect(canAssignGlobalRole(a, 'municipal_inspector')).toBe(true);
      expect(canAssignGlobalRole(a, 'municipal_secretary')).toBe(true);
      expect(canAssignGlobalRole(a, 'admin')).toBe(false);
      expect(canAssignGlobalRole(a, 'fed_admin')).toBe(false);
      expect(canAssignGlobalRole(a, 'league_admin')).toBe(false);
    }
  });
  it('liga solo crea administradores de liga', () => {
    expect(canAssignGlobalRole('league_admin', 'league_admin')).toBe(true);
    expect(canAssignGlobalRole('league_admin', 'admin')).toBe(false);
    expect(canAssignGlobalRole('league_admin', 'municipal_admin')).toBe(false);
  });
  it('rol desconocido no puede asignar nada', () => {
    expect(canAssignGlobalRole('coach', 'admin')).toBe(false);
  });
});
