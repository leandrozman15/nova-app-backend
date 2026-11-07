import {
  buildDemo,
  demoBoundary,
  demoPrefix,
  pointInPolygon,
  LatLng,
} from './municipal-demo-data';

const square: LatLng[] = [
  [-34.5, -58.7],
  [-34.5, -58.6],
  [-34.58, -58.6],
  [-34.58, -58.7],
];
const base = {
  municipalityId: 'cmabcdef123456',
  municipalityName: 'Malvinas',
  companyId: 'co1',
  center: [-34.54, -58.65] as LatLng,
  now: new Date('2026-11-07T12:00:00Z'),
};

describe('municipal-demo-data', () => {
  const d = buildDemo({ ...base, boundary: square });

  it('todos los ids llevan el prefijo demo del municipio', () => {
    const P = demoPrefix(base.municipalityId);
    expect(P).toBe('demo_123456_');
    const ids = [
      ...d.clubs,
      ...d.teams,
      ...d.players,
      ...d.facilities,
      ...d.documents,
      ...d.requests,
      ...d.announcements,
      ...d.projects.map((p) => p.project),
    ].map((x: any) => x.id as string);
    expect(ids.every((i) => i.startsWith(P))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('los clubes y proyectos caen dentro del contorno', () => {
    expect(
      d.clubs.every((c: any) =>
        pointInPolygon([c.latitude, c.longitude], square),
      ),
    ).toBe(true);
    expect(
      d.projects.every((p) =>
        pointInPolygon([p.project.lat, p.project.lng], square),
      ),
    ).toBe(true);
  });

  it('es determinista', () => {
    expect(
      JSON.stringify(
        buildDemo({ ...base, boundary: square }).players.slice(0, 5),
      ),
    ).toBe(JSON.stringify(d.players.slice(0, 5)));
  });

  it('tiene brechas de género: rugby casi sin mujeres, hockey casi todas', () => {
    const pct = (club: string) => {
      const ps = d.players.filter(
        (p: any) => p.clubId.endsWith(club) && p.gender,
      );
      return ps.filter((p: any) => p.gender === 'F').length / ps.length;
    };
    expect(pct('club5')).toBeLessThan(0.25);
    expect(pct('club3')).toBeGreaterThan(0.75);
  });

  it('cubre todos los estados de proyecto relevantes, pedidos y documentación mixta', () => {
    expect(new Set(d.projects.map((p) => p.project.status))).toEqual(
      new Set([
        'in_progress',
        'approved',
        'budgeting',
        'draft',
        'completed',
        'paused',
      ]),
    );
    expect(new Set(d.requests.map((r: any) => r.status))).toEqual(
      new Set(['pending', 'approved', 'rejected', 'delivered']),
    );
    expect(
      d.documents.some(
        (x: any) => x.kind === 'insurance' && x.expiresAt < base.now,
      ),
    ).toBe(true);
    expect(
      d.documents
        .filter((x: any) => x.clubId.endsWith('club6'))
        .some((x: any) => x.kind === 'insurance'),
    ).toBe(false);
  });

  it('sin contorno usa el centro', () => {
    const n = buildDemo(base);
    expect(n.clubs.length).toBe(8);
    expect(
      n.clubs.every((c: any) => Math.abs(c.latitude - base.center[0]) < 0.05),
    ).toBe(true);
  });

  it('demoBoundary genera un polígono cerrable que contiene el centro y es estable', () => {
    const b = demoBoundary(base.center, 'x');
    expect(b.length).toBe(16);
    expect(pointInPolygon(base.center, b)).toBe(true);
    expect(demoBoundary(base.center, 'x')).toEqual(b);
    const d2 = buildDemo({ ...base, boundary: b });
    expect(
      d2.clubs.every((c: any) => pointInPolygon([c.latitude, c.longitude], b)),
    ).toBe(true);
  });
});
