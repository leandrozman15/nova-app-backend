import { placementOf } from './padel-placement';

describe('puesto en el cuadro de pádel', () => {
  it('sin partidos asignados todavía: null (inscripto, sin cuadro)', () => {
    expect(placementOf([], 'team-1', 3)).toBeNull();
  });

  it('ganó la final: Campeón/a', () => {
    const matches = [
      { round: 1, teamAId: 'team-1', teamBId: 't2', winnerId: 'team-1' },
      { round: 2, teamAId: 'team-1', teamBId: 't3', winnerId: 'team-1' },
      { round: 3, teamAId: 'team-1', teamBId: 't4', winnerId: 'team-1' },
    ];
    expect(placementOf(matches, 'team-1', 3)).toEqual({ label: 'Campeón/a', champion: true });
  });

  it('perdió la final: Subcampeón/a', () => {
    const matches = [{ round: 3, teamAId: 'team-1', teamBId: 't4', winnerId: 't4' }];
    expect(placementOf(matches, 'team-1', 3)).toEqual({ label: 'Subcampeón/a', champion: false });
  });

  it('eliminado en semifinal (una ronda antes de la final)', () => {
    const matches = [{ round: 2, teamAId: 'team-1', teamBId: 't4', winnerId: 't4' }];
    expect(placementOf(matches, 'team-1', 3)).toEqual({ label: 'Eliminado en Semifinal', champion: false });
  });

  it('eliminado en cuartos de final', () => {
    const matches = [{ round: 1, teamAId: 'team-1', teamBId: 't4', winnerId: 't4' }];
    expect(placementOf(matches, 'team-1', 3)).toEqual({ label: 'Eliminado en Cuartos de final', champion: false });
  });

  it('partido todavía sin jugar (winnerId null): "Jugando <ronda>"', () => {
    const matches = [{ round: 2, teamAId: 'team-1', teamBId: 't4', winnerId: null }];
    expect(placementOf(matches, 'team-1', 3)).toEqual({ label: 'Jugando Semifinal', champion: false });
  });

  it('ganó pero la próxima ronda todavía no tiene partido cargado: "Avanzó a <ronda>"', () => {
    const matches = [{ round: 1, teamAId: 'team-1', teamBId: 't4', winnerId: 'team-1' }];
    expect(placementOf(matches, 'team-1', 3)).toEqual({ label: 'Avanzó a Semifinal', champion: false });
  });

  it('toma la ronda más avanzada en la que jugó, no la primera', () => {
    const matches = [
      { round: 1, teamAId: 'team-1', teamBId: 't2', winnerId: 'team-1' },
      { round: 2, teamAId: 'team-1', teamBId: 't3', winnerId: 't3' },
    ];
    expect(placementOf(matches, 'team-1', 2)).toEqual({ label: 'Subcampeón/a', champion: false });
  });
});
