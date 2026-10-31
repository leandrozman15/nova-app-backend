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
