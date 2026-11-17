import { placementOf, planMissing, sportFor, withPlanned } from './player-import.plan';
import { validateRows } from './player-import.rules';

describe('implantación: disciplina → rama → categoría', () => {
  const rows = [
    { sport: 'Fútbol', category: '2013', branch: 'Mixto', division: 'Fútbol infantil' },
    { sport: 'futbol', category: '2013', branch: 'Mixto', division: 'Fútbol infantil' },
    { sport: 'Fútbol', category: '2014', branch: 'Mixto', division: 'Fútbol infantil' },
    { sport: 'Hockey', category: 'Hockey 5 a 9', branch: 'Femenino' },
    { sport: 'Hockey', category: 'Hockey 10 a 13', branch: 'Femenino' },
  ] as any[];

  it('crea una rama por deporte con sus categorías adentro', () => {
    const plan = planMissing(rows, [], []);
    expect(plan.disciplines.map((d) => d.sportId)).toEqual(['football', 'hockey']);
    expect(plan.divisions.map((d) => `${d.sport}:${d.name}:${d.branch}:${d.players}`)).toEqual([
      'football:Fútbol infantil:mixto:3',
      'hockey:Hockey femenino:femenino:2',
    ]);
    expect(plan.teams.map((t) => `${t.divisionName} › ${t.name}:${t.players}`)).toEqual([
      'Fútbol infantil › 2013:2',
      'Fútbol infantil › 2014:1',
      'Hockey femenino › Hockey 5 a 9:1',
      'Hockey femenino › Hockey 10 a 13:1',
    ]);
  });

  it('no repite lo que el club ya tiene', () => {
    const divisions = [{ id: 'r1', name: 'Fútbol infantil', sport: 'football' }];
    const teams = [{ id: 't13', name: '2013', divisionId: 'r1' }];
    const plan = planMissing(rows, [{ sportId: 'football', name: 'Fútbol' }], divisions, teams);
    expect(plan.divisions.map((d) => d.name)).toEqual(['Hockey femenino']);
    expect(plan.teams.map((t) => t.name)).toEqual(['2014', 'Hockey 5 a 9', 'Hockey 10 a 13']);
  });

  it('compatibilidad: si la categoría es el nombre de una rama existente, va a esa rama', () => {
    const p = placementOf({ category: 'Sub 14', branch: 'Femenino' } as any, { sportId: 'hockey', name: 'Hockey' }, [{ id: 'd', name: 'Sub 14', sport: 'hockey' }]);
    expect(p).toMatchObject({ divisionName: 'Sub 14', teamName: null });
  });

  it('reconoce alias del catálogo', () => {
    expect(sportFor('Básquet').sportId).toBe('basketball');
    expect(sportFor('VOLEY').sportId).toBe('volleyball');
  });

  it('con lo planificado, la revisión ubica al jugador en la rama sin errores', () => {
    const full = [{ firstName: 'Ana', lastName: 'Pérez', dni: '990000001', birthDate: '2015-03-02', gender: 'Femenino', sport: 'Hockey', category: 'Sub 14', branch: 'Femenino' }] as any[];
    const plan = planMissing(full, [], []);
    const lists = withPlanned([], [], [], plan);
    const place = placementOf(full[0], { sportId: 'hockey', name: 'Hockey' }, lists.divisions);
    const [res] = validateRows([{ ...full[0], category: place.divisionName }], { disciplines: lists.disciplines, divisions: lists.divisions, today: '2026-11-17' });
    expect(res.errors).toEqual([]);
    expect(res.player?.divisionId).toBe('nueva-rama-0');
    expect(lists.teams[0]).toMatchObject({ name: 'Sub 14', divisionId: 'nueva-rama-0' });
  });
});
