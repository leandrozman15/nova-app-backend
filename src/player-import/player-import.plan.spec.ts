import { planMissing, sportFor, withPlanned } from './player-import.plan';
import { validateRows } from './player-import.rules';

describe('planMissing', () => {
  const rows = [
    { sport: 'Fútbol', category: '2013', branch: 'Mixto' },
    { sport: 'futbol', category: '2013', branch: 'Mixto' },
    { sport: 'Hockey', category: 'Hockey 5 a 9', branch: 'Femenino' },
    { sport: 'Hockey', category: 'Sub 14', branch: 'Femenino' },
    { sport: 'Hockey', category: 'Sub 14', branch: 'Masculino' },
    { sport: 'Tiro con arco', category: '' },
  ] as any[];

  it('detecta deportes y categorías faltantes sin repetir', () => {
    const plan = planMissing(rows, [], []);
    expect(plan.disciplines.map((d) => d.sportId)).toEqual(['football', 'hockey', 'tiro_con_arco']);
    expect(plan.divisions.map((d) => `${d.sport}:${d.name}:${d.players}:${d.branch}`)).toEqual([
      'football:2013:2:mixto',
      'hockey:Hockey 5 a 9:1:femenino',
      'hockey:Sub 14:2:null',
    ]);
  });

  it('no crea lo que el club ya tiene (por nombre o por id)', () => {
    const plan = planMissing(rows, [{ sportId: 'football', name: 'Fútbol infantil' }], [{ id: 'd1', name: '2013', sport: 'football' }]);
    expect(plan.disciplines.map((d) => d.sportId)).toEqual(['hockey', 'tiro_con_arco']);
    expect(plan.divisions.some((d) => d.name === '2013')).toBe(false);
  });

  it('reconoce alias del catálogo', () => {
    expect(sportFor('Básquet').sportId).toBe('basketball');
    expect(sportFor('VOLEY').sportId).toBe('volleyball');
  });

  it('con lo planificado, la revisión ya no marca errores de deporte', () => {
    const full = [{ firstName: 'Ana', lastName: 'Pérez', dni: '990000001', birthDate: '2015-03-02', gender: 'Femenino', sport: 'Hockey', category: 'Sub 14', branch: 'Femenino' }] as any[];
    const plan = planMissing(full, [], []);
    const lists = withPlanned([], [], plan);
    const [res] = validateRows(full, { ...lists, today: '2026-11-17' });
    expect(res.errors).toEqual([]);
    expect(res.player?.divisionId).toBe('nueva-0');
  });
});
