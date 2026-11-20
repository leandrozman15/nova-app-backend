import { dueForPush, pushReminder, whatsappReminder, whenLabel } from './reminder-rules';

const base = { clubName: 'Club Demo', facilityName: 'Fútbol 5 · Cancha 1', date: '2026-11-20', today: '2026-11-20', startMinute: 18 * 60, durationMinutes: 60 };

describe('recordatorios de turnos', () => {
  it('sale cuando faltan 3 horas o menos (y más de 20 minutos)', () => {
    const now = new Date('2026-11-20T18:00:00Z');
    expect(dueForPush(new Date('2026-11-20T21:00:00Z'), now)).toBe(true);
    expect(dueForPush(new Date('2026-11-20T21:30:00Z'), now)).toBe(false);
    expect(dueForPush(new Date('2026-11-20T18:10:00Z'), now)).toBe(false);
  });

  it('arma el mensaje de WhatsApp con el nombre, la cancha y el horario', () => {
    expect(whatsappReminder({ ...base, contactName: 'Martín Demo' })).toBe(
      'Hola Martín! Te escribimos de Club Demo. Recordá que hoy tenés alquilada Fútbol 5 · Cancha 1 de 18:00 a 19:00 hs. ¡Te esperamos! Si no podés venir, avisanos así liberamos el turno.',
    );
    expect(whenLabel('2026-11-21', '2026-11-20')).toBe('el 21/11');
  });

  it('arma el push', () => {
    expect(pushReminder(base)).toEqual({
      title: 'Tu turno hoy a las 18:00',
      body: 'Fútbol 5 · Cancha 1 en Club Demo, de 18:00 a 19:00. ¡Te esperamos!',
    });
  });
});
