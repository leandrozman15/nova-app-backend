import { roleOf, tempPassword, validateStaffRows } from './staff-import.rules';

const disciplines = [{ sportId: 'hockey', name: 'Hockey' }, { sportId: 'futbol', name: 'Fútbol' }];
const base = { row: 2, firstName: 'camila', lastName: 'RODRÍGUEZ', dni: '30.123.456', role: 'Entrenador Nivel 2 (Plantel)', email: ' Camila@Ejemplo.com ' };

describe('validateStaffRows', () => {
  it('normaliza una fila completa', () => {
    const [r] = validateStaffRows(
      [{ ...base, birthDate: '15/03/1985', sport: 'hockey', bloodType: 'o+', parkingIncluded: 'Sí', phone: '11 5555-1234' }],
      { disciplines },
    );
    expect(r.status).toBe('ok');
    expect(r.staff).toMatchObject({
      firstName: 'Camila', lastName: 'Rodríguez', dni: '30123456', role: 'coach_lvl2',
      email: 'camila@ejemplo.com', birthDate: '1985-03-15', sport: 'hockey', bloodType: 'O+', parkingIncluded: true,
    });
  });

  it('marca como error lo obligatorio que falta o está mal', () => {
    const [r] = validateStaffRows([{ row: 5, firstName: 'Ana', dni: '12', role: 'Jardinero', email: 'sin-arroba' }], { disciplines });
    expect(r.status).toBe('error');
    expect(r.errors.join(' ')).toMatch(/apellido/);
    expect(r.errors.join(' ')).toMatch(/DNI/);
    expect(r.errors.join(' ')).toMatch(/rol "Jardinero"/);
    expect(r.errors.join(' ')).toMatch(/email/);
    expect(r.staff).toBeNull();
  });

  it('avisa sin frenar cuando la fecha, la disciplina o el grupo sanguíneo no se entienden', () => {
    const [r] = validateStaffRows([{ ...base, birthDate: '99/99/9999', sport: 'Ajedrez', bloodType: 'Z+' }], { disciplines });
    expect(r.status).toBe('warning');
    expect(r.warnings).toHaveLength(3);
    expect(r.staff).toMatchObject({ birthDate: null, sport: null, bloodType: null });
  });

  it('detecta email y DNI repetidos dentro de la planilla', () => {
    const out = validateStaffRows(
      [base, { ...base, row: 3, dni: '99888777' }, { ...base, row: 4, email: 'otra@ejemplo.com' }],
      { disciplines },
    );
    expect(out.map((r) => r.status)).toEqual(['ok', 'error', 'error']);
    expect(out[1].errors[0]).toMatch(/email.*fila 2/);
    expect(out[2].errors[0]).toMatch(/DNI.*fila 2/);
  });
});

describe('roleOf', () => {
  it('acepta la etiqueta de la lista, el código y nombres cortos', () => {
    expect(roleOf('Operador de Buffet')).toBe('buffet');
    expect(roleOf('Control de acceso')).toBe('access_control');
    expect(roleOf('coordinador')).toBe('coordinator');
    expect(roleOf('Entrenador Nivel 1 (Jefe de Rama)')).toBe('coach_lvl1');
    expect(roleOf('club_admin')).toBe('club_admin');
    expect(roleOf('Entrenador')).toBeNull(); // sin nivel es ambiguo
  });
});

describe('tempPassword', () => {
  it('genera claves de 10 caracteres sin letras que se confunden y distintas entre sí', () => {
    const a = tempPassword();
    expect(a).toHaveLength(10);
    expect(a).not.toMatch(/[lIO01]/);
    expect(tempPassword()).not.toBe(a);
  });
});

describe('validateStaffRows · categorías', () => {
  const { validateStaffRows: v } = require('./staff-import.rules');
  const ctx = {
    disciplines: [{ sportId: 'football', name: 'Fútbol' }, { sportId: 'hockey', name: 'Hockey' }],
    divisions: [
      { id: 'f13', name: '2013', sport: 'football' },
      { id: 'f14', name: '2014', sport: 'football' },
      { id: 'h1', name: 'Hockey 5 a 9', sport: 'hockey' },
    ],
  };
  const base = { firstName: 'ana', lastName: 'gómez', dni: '990100001', role: 'Entrenador Nivel 2 (Plantel)', email: 'ana@example.com' };

  it('asigna una o varias categorías de su disciplina', () => {
    const [r] = v([{ row: 2, ...base, sport: 'Fútbol', category: '2013, 2014' }], ctx);
    expect(r.staff.divisions.map((d: any) => `${d.kind}:${d.id}`)).toEqual(['division:f13', 'division:f14']);
    expect(r.warnings).toEqual([]);
  });

  it('avisa si la categoría no existe, sin bloquear la fila', () => {
    const [r] = v([{ row: 2, ...base, sport: 'Hockey', category: '2013' }], ctx);
    expect(r.staff.divisions).toEqual([]);
    expect(r.status).toBe('warning');
  });
});

describe('validateStaffRows · categorías dentro de la rama', () => {
  const { validateStaffRows: v } = require('./staff-import.rules');
  const ctx = {
    disciplines: [{ sportId: 'football', name: 'Fútbol' }, { sportId: 'hockey', name: 'Hockey' }],
    divisions: [{ id: 'rf', name: 'Fútbol infantil', sport: 'football' }, { id: 'rh', name: 'Hockey femenino', sport: 'hockey' }],
    teams: [{ id: 't13', name: '2013', divisionId: 'rf' }, { id: 'th1', name: 'Hockey 5 a 9', divisionId: 'rh' }],
  };
  const base = { firstName: 'ana', lastName: 'gómez', dni: '990100009', role: 'Entrenador Nivel 2 (Plantel)', email: 'ana2@example.com' };

  it('el entrenador queda en la categoría (plantel) de su rama', () => {
    const [r] = v([{ row: 2, ...base, sport: 'Fútbol', category: '2013' }], ctx);
    expect(r.staff.divisions).toEqual([{ id: 't13', name: '2013', kind: 'team', divisionId: 'rf' }]);
  });

  it('un coordinador puede quedar a cargo de una rama entera', () => {
    const [r] = v([{ row: 2, ...base, role: 'Coordinador de Rama', sport: 'Hockey', category: 'Hockey femenino' }], ctx);
    expect(r.staff.divisions).toEqual([{ id: 'rh', name: 'Hockey femenino', kind: 'division', divisionId: 'rh' }]);
  });
});
