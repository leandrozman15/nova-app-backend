import { dayTitle, freeRanges, hasFreeTime, storyCaption, storyDates, trimStory } from './story-rules';
import { renderStoryJpeg, renderStorySvg, fit, textWidth } from './story-render';
import { storySignature, validStorySignature } from './availability-story.service';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../instagram/instagram.service', () => ({ InstagramService: class {} }));
jest.mock('../push/push.service', () => ({ PushService: class {} }));
jest.mock('../activities/activities.service', () => ({ ActivitiesService: class {} }));
jest.mock('../bookings/fixed-turns', () => ({ ensureOccurrences: jest.fn() }));
jest.mock('../subscriptions/plan-entitlements', () => ({ clubEntitlements: jest.fn() }));

const h = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
const cell = (a: string, status: 'free' | 'taken' | 'past') => ({ start: h(a), end: h(a) + 30, status });

describe('estado de turnos libres', () => {
  it('une franjas libres y descarta las de menos de una hora', () => {
    const cells = [
      cell('17:00', 'past'),
      cell('17:30', 'free'),
      cell('18:00', 'free'),
      cell('18:30', 'taken'),
      cell('19:00', 'free'),
      cell('19:30', 'taken'),
      cell('20:00', 'free'),
      cell('20:30', 'free'),
      cell('21:00', 'free'),
    ];
    expect(freeRanges(cells)).toEqual([
      { start: h('17:30'), end: h('18:30') },
      { start: h('20:00'), end: h('21:30') },
    ]);
  });

  it('titula hoy y mañana en la zona del club', () => {
    const now = new Date('2026-11-21T02:30:00Z'); // 23:30 del 20/11 en Buenos Aires
    expect(storyDates('America/Argentina/Buenos_Aires', now)).toEqual(['2026-11-20', '2026-11-21']);
    expect(dayTitle('2026-11-20', 0)).toBe('Hoy · viernes 20/11');
    expect(dayTitle('2026-11-21', 1)).toBe('Mañana · sábado 21/11');
  });

  it('arma el texto y sabe si hay algo libre', () => {
    const days = trimStory([
      { date: '2026-11-20', title: 'Hoy · viernes 20/11', facilities: [{ name: 'Cancha 1', ranges: [{ start: h('18:00'), end: h('20:00') }] }, { name: 'Cancha 2', ranges: [] }] },
    ]);
    expect(hasFreeTime(days)).toBe(true);
    expect(storyCaption({ clubName: 'Club Demo', days, contact: 'Tel. 1100000000' })).toBe(
      'Turnos libres en Club Demo\n\nHoy · viernes 20/11\nCancha 1: 18:00 a 20:00\n\nReservas: Tel. 1100000000',
    );
    expect(hasFreeTime([{ ...days[0], facilities: [{ name: 'X', ranges: [] }] }])).toBe(false);
  });

  it('dibuja un JPEG 1080x1920 con las tipografías de la app', () => {
    const data = {
      clubName: 'Club <Demo> & Cía',
      days: [{ date: '2026-11-20', title: 'Hoy · viernes 20/11', facilities: [{ name: 'Fútbol 5', ranges: [{ start: h('18:00'), end: h('20:00') }] }] }],
    };
    expect(renderStorySvg(data)).toContain('Club &lt;Demo&gt; &amp; Cía');
    const jpeg = renderStoryJpeg(data);
    expect(jpeg.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(fit('Una cancha con un nombre larguísimo de verdad', 32, 300).endsWith('…')).toBe(true);
    expect(textWidth('18:00 a 20:00', 36)).toBeGreaterThan(200);
  });

  it('firma el link público de la imagen', () => {
    process.env.PAYMENT_TOKENS_KEY = 'clave-de-prueba';
    const sig = storySignature('club1', '2026-11-20');
    expect(validStorySignature('club1', '2026-11-20', sig)).toBe(true);
    expect(validStorySignature('club1', '2026-11-21', sig)).toBe(false);
    expect(validStorySignature('club2', '2026-11-20', sig)).toBe(false);
  });
});
