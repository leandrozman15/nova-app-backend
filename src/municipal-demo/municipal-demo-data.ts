/** Generador (puro y determinista) de datos de demostración para un municipio. Todos los ids empiezan con `demo_<sufijo>_`. */

export type LatLng = [number, number];
export type DemoInput = {
  municipalityId: string;
  municipalityName: string;
  companyId: string;
  center: LatLng;
  boundary?: LatLng[];
  now?: Date;
};

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoPrefix(municipalityId: string): string {
  return `demo_${municipalityId.slice(-6)}_`;
}

export function pointInPolygon(p: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (
      yi > p[0] !== yj > p[0] &&
      p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

const FIRST_F = [
  'Sofía',
  'Valentina',
  'Martina',
  'Camila',
  'Lucía',
  'Julieta',
  'Agustina',
  'Micaela',
  'Florencia',
  'Abril',
  'Catalina',
  'Emilia',
  'Milagros',
  'Candela',
];
const FIRST_M = [
  'Mateo',
  'Santiago',
  'Benjamín',
  'Thiago',
  'Lautaro',
  'Joaquín',
  'Facundo',
  'Tomás',
  'Bautista',
  'Nicolás',
  'Franco',
  'Ignacio',
  'Lucas',
  'Gonzalo',
];
const LAST = [
  'González',
  'Rodríguez',
  'Gómez',
  'Fernández',
  'López',
  'Díaz',
  'Martínez',
  'Pérez',
  'Romero',
  'Sosa',
  'Álvarez',
  'Torres',
  'Ruiz',
  'Ramírez',
  'Flores',
  'Acosta',
  'Benítez',
  'Medina',
  'Herrera',
  'Castro',
];

type ClubSpec = {
  name: string;
  sport: string;
  second?: string;
  womenPct: number;
  size: number;
  ages: 'kids' | 'mixed' | 'adults';
  west: boolean;
  facilities: Array<{
    name: string;
    sport: string;
    typeLabel: string;
    bookable?: boolean;
  }>;
  docs: {
    insurance: 'valid' | 'expiring' | 'expired' | 'missing';
    habilitation: 'valid' | 'expiring' | 'expired' | 'missing';
  };
};

const CLUBS: ClubSpec[] = [
  {
    name: 'Club Atlético Los Pinos',
    sport: 'football',
    womenPct: 10,
    size: 62,
    ages: 'kids',
    west: true,
    docs: { insurance: 'valid', habilitation: 'valid' },
    facilities: [
      {
        name: 'Cancha de fútbol 11',
        sport: 'football',
        typeLabel: 'Cancha de fútbol 11',
      },
      {
        name: 'Cancha de fútbol 7',
        sport: 'football',
        typeLabel: 'Cancha de fútbol 7',
        bookable: true,
      },
      { name: 'Vestuarios', sport: 'multi', typeLabel: 'Vestuarios' },
    ],
  },
  {
    name: 'Club Deportivo Unión Vecinal',
    sport: 'football',
    second: 'basketball',
    womenPct: 28,
    size: 70,
    ages: 'mixed',
    west: true,
    docs: { insurance: 'expiring', habilitation: 'valid' },
    facilities: [
      {
        name: 'Cancha de fútbol 5',
        sport: 'football',
        typeLabel: 'Cancha de fútbol 5',
        bookable: true,
      },
      {
        name: 'Gimnasio techado',
        sport: 'basketball',
        typeLabel: 'Cancha de básquet',
      },
    ],
  },
  {
    name: 'Hockey Club Las Lomas',
    sport: 'hockey',
    womenPct: 93,
    size: 48,
    ages: 'kids',
    west: true,
    docs: { insurance: 'valid', habilitation: 'expiring' },
    facilities: [
      {
        name: 'Cancha de césped sintético',
        sport: 'hockey',
        typeLabel: 'Cancha de hockey',
      },
      { name: 'Buffet y vestuarios', sport: 'multi', typeLabel: 'Vestuarios' },
    ],
  },
  {
    name: 'Club Náutico y Natación del Parque',
    sport: 'swimming',
    womenPct: 52,
    size: 56,
    ages: 'mixed',
    west: true,
    docs: { insurance: 'valid', habilitation: 'valid' },
    facilities: [
      { name: 'Pileta de 25 metros', sport: 'swimming', typeLabel: 'Pileta' },
      { name: 'Pileta de aprendizaje', sport: 'swimming', typeLabel: 'Pileta' },
    ],
  },
  {
    name: 'Rugby Club Los Cardenales',
    sport: 'rugby',
    womenPct: 7,
    size: 52,
    ages: 'mixed',
    west: true,
    docs: { insurance: 'expired', habilitation: 'valid' },
    facilities: [
      { name: 'Cancha de rugby', sport: 'rugby', typeLabel: 'Cancha de rugby' },
      { name: 'Club house', sport: 'multi', typeLabel: 'Salón' },
      {
        name: 'Cancha de entrenamiento',
        sport: 'rugby',
        typeLabel: 'Cancha de rugby',
      },
    ],
  },
  {
    name: 'Asociación Vóley Barrial',
    sport: 'volleyball',
    womenPct: 80,
    size: 38,
    ages: 'mixed',
    west: false,
    docs: { insurance: 'missing', habilitation: 'missing' },
    facilities: [
      {
        name: 'Polideportivo barrial',
        sport: 'volleyball',
        typeLabel: 'Cancha de vóley',
      },
    ],
  },
  {
    name: 'Club de Pádel y Tenis El Ombú',
    sport: 'padel',
    second: 'tennis',
    womenPct: 46,
    size: 44,
    ages: 'adults',
    west: false,
    docs: { insurance: 'valid', habilitation: 'valid' },
    facilities: [
      {
        name: 'Cancha de pádel 1',
        sport: 'padel',
        typeLabel: 'Cancha de pádel',
        bookable: true,
      },
      {
        name: 'Cancha de pádel 2',
        sport: 'padel',
        typeLabel: 'Cancha de pádel',
        bookable: true,
      },
      {
        name: 'Cancha de tenis',
        sport: 'tennis',
        typeLabel: 'Cancha de tenis',
        bookable: true,
      },
    ],
  },
  {
    name: 'Centro Municipal de Atletismo',
    sport: 'athletics',
    womenPct: 50,
    size: 36,
    ages: 'kids',
    west: true,
    docs: { insurance: 'valid', habilitation: 'valid' },
    facilities: [
      { name: 'Pista de atletismo', sport: 'athletics', typeLabel: 'Pista' },
    ],
  },
];

const bandAge = (r: () => number, mode: ClubSpec['ages']): number => {
  const x = r();
  if (mode === 'kids')
    return x < 0.7 ? 6 + Math.floor(r() * 12) : 18 + Math.floor(r() * 15);
  if (mode === 'adults')
    return x < 0.15 ? 14 + Math.floor(r() * 4) : 20 + Math.floor(r() * 36);
  return x < 0.35
    ? 8 + Math.floor(r() * 9)
    : x < 0.7
      ? 17 + Math.floor(r() * 14)
      : 28 + Math.floor(r() * 28);
};

export function buildDemo(input: DemoInput) {
  const now = input.now ?? new Date();
  const P = demoPrefix(input.municipalityId);
  const r = rng(hash(input.municipalityId));
  const { center, boundary } = input;
  const ring = boundary && boundary.length >= 3 ? boundary : null;

  // Área de trabajo: bbox del contorno o ~4 km alrededor del centro.
  const lats = ring
    ? ring.map((p) => p[0])
    : [center[0] - 0.036, center[0] + 0.036];
  const lngs = ring
    ? ring.map((p) => p[1])
    : [center[1] - 0.045, center[1] + 0.045];
  const [minLat, maxLat, minLng, maxLng] = [
    Math.min(...lats),
    Math.max(...lats),
    Math.min(...lngs),
    Math.max(...lngs),
  ];
  const midLng = (minLng + maxLng) / 2;
  const pick = (west: boolean): LatLng => {
    for (let i = 0; i < 400; i++) {
      const lng = west
        ? minLng + (midLng - minLng) * (0.1 + 0.9 * r())
        : midLng + (maxLng - midLng) * (0.3 + 0.6 * r());
      const lat = minLat + (maxLat - minLat) * (0.1 + 0.8 * r());
      if (!ring || pointInPolygon([lat, lng], ring)) return [lat, lng];
    }
    return center;
  };

  const base = { companyId: input.companyId };
  const clubs: any[] = [],
    teams: any[] = [],
    players: any[] = [],
    facilities: any[] = [],
    documents: any[] = [],
    requests: any[] = [];
  const clubIds: string[] = [];

  CLUBS.forEach((c, ci) => {
    const clubId = `${P}club${ci + 1}`;
    clubIds.push(clubId);
    const [lat, lng] = pick(c.west);
    clubs.push({
      id: clubId,
      ...base,
      name: c.name,
      sport: c.sport,
      status: 'approved',
      municipalityId: input.municipalityId,
      municipalityName: input.municipalityName,
      city: input.municipalityName,
      address: `Calle ${10 + ci * 7} N° ${100 + ci * 233}`,
      latitude: lat,
      longitude: lng,
      isPublic: true,
      description: 'Institución de demostración',
      foundationDate: new Date(Date.UTC(1950 + ci * 6, 3, 12)),
    });
    const teamIds = [`${P}team${ci + 1}a`, `${P}team${ci + 1}b`];
    teams.push(
      {
        id: teamIds[0],
        ...base,
        clubId,
        name: 'Infantil',
        category: 'Infantil',
      },
      { id: teamIds[1], ...base, clubId, name: 'Mayores', category: 'Mayores' },
    );

    for (let k = 0; k < c.size; k++) {
      const female = r() * 100 < c.womenPct;
      const first = (female ? FIRST_F : FIRST_M)[Math.floor(r() * 14)];
      const age = bandAge(r, c.ages);
      const born = new Date(
        Date.UTC(
          now.getUTCFullYear() - age,
          Math.floor(r() * 12),
          1 + Math.floor(r() * 27),
        ),
      );
      const noGender = r() < 0.03;
      players.push({
        id: `${P}p${ci + 1}_${k}`,
        ...base,
        clubId,
        teamId: age < 18 ? teamIds[0] : teamIds[1],
        firstName: first,
        lastName: LAST[Math.floor(r() * 20)],
        dni: String(30000000 + Math.floor(r() * 20000000)),
        birthDate: born,
        gender: noGender ? null : female ? 'F' : 'M',
        sport: c.second && r() < 0.35 ? c.second : c.sport,
        active: r() > 0.04,
        status: 'active',
        hasMedicalCert: r() > 0.25,
        hasMinorAuth: age < 18,
      });
    }

    c.facilities.forEach((f, fi) =>
      facilities.push({
        id: `${P}fac${ci + 1}_${fi}`,
        ...base,
        clubId,
        name: f.name,
        type: f.sport === 'multi' ? 'servicio' : 'cancha',
        typeLabel: f.typeLabel,
        sport: f.sport === 'multi' ? null : f.sport,
        status: 'available',
        statusLabel: 'Disponible',
        bookable: !!f.bookable,
        hourlyPrice: f.bookable ? 12000 : null,
        address: `Calle ${10 + ci * 7} N° ${100 + ci * 233}`,
        neighborhood: input.municipalityName,
      }),
    );

    const day = 86_400_000;
    const expiry = {
      valid: now.getTime() + 240 * day,
      expiring: now.getTime() + 14 * day,
      expired: now.getTime() - 25 * day,
    };
    const doc = (kind: string, title: string, e: Date | null) =>
      documents.push({
        id: `${P}doc${ci + 1}_${kind}`,
        ...base,
        clubId,
        kind,
        title,
        issuedAt: new Date(now.getTime() - 200 * day),
        expiresAt: e,
      });
    doc('statute', 'Estatuto social', null);
    doc(
      'legal_status',
      'Personería jurídica',
      new Date(now.getTime() + 500 * day),
    );
    if (c.docs.insurance !== 'missing')
      doc('insurance', 'Póliza de seguro', new Date(expiry[c.docs.insurance]));
    if (c.docs.habilitation !== 'missing')
      doc(
        'habilitation',
        'Habilitación municipal',
        new Date(expiry[c.docs.habilitation]),
      );
  });

  const rq = (
    n: number,
    ci: number,
    type: string,
    title: string,
    description: string,
    amount: number | null,
    status: string,
    note: string | null,
    daysAgo: number,
  ) =>
    requests.push({
      id: `${P}req${n}`,
      ...base,
      clubId: clubIds[ci],
      municipalityId: input.municipalityId,
      type,
      title,
      description,
      amountRequested: amount,
      status,
      resolutionNote: note,
      resolvedAt:
        status === 'pending'
          ? null
          : new Date(now.getTime() - (daysAgo - 3) * 86_400_000),
      createdAt: new Date(now.getTime() - daysAgo * 86_400_000),
    });
  rq(
    1,
    0,
    'subsidy',
    'Subsidio para torneo infantil',
    'Arbitrajes, hidratación y trofeos para 200 chicos.',
    180000,
    'pending',
    null,
    4,
  );
  rq(
    2,
    2,
    'materials',
    'Pelotas y sticks para escuelita',
    'Material para 40 nuevas alumnas.',
    95000,
    'approved',
    'Aprobado. Retirar en Deportes de lunes a viernes.',
    12,
  );
  rq(
    3,
    4,
    'facility',
    'Uso del playón municipal los sábados',
    'Para entrenamientos de la categoría juvenil.',
    null,
    'rejected',
    'El playón está comprometido todo el año con otra actividad.',
    20,
  );
  rq(
    4,
    6,
    'subsidy',
    'Reparación de iluminación',
    'Cambio de reflectores de las canchas 1 y 2.',
    240000,
    'delivered',
    'Entregado el mes pasado.',
    40,
  );

  const lineSets = (
    items: Array<[string, string, number, number]>,
    idp: string,
  ) =>
    items.map(([concept, category, plannedAmount, spentAmount], i) => ({
      id: `${idp}_l${i}`,
      concept,
      category,
      plannedAmount,
      spentAmount,
    }));
  const proj = (
    n: number,
    name: string,
    category: string,
    status: string,
    priority: string,
    west: boolean,
    items: Array<[string, string, number, number]>,
    desc: string,
    offsetDays: number,
  ) => {
    const id = `${P}proj${n}`;
    const [lat, lng] = pick(west);
    return {
      project: {
        id,
        ...base,
        municipalityId: input.municipalityId,
        name,
        description: desc,
        category,
        status,
        priority,
        responsible: 'Secretaría de Deportes',
        lat,
        lng,
        address: `Zona ${['Norte', 'Sur', 'Este', 'Oeste'][n % 4]}`,
        startDate: new Date(now.getTime() - offsetDays * 86_400_000),
        endDate: new Date(now.getTime() + (120 - offsetDays) * 86_400_000),
      },
      lines: lineSets(items, id).map((l) => ({ ...l, projectId: id })),
      events: [
        {
          id: `${id}_e0`,
          projectId: id,
          kind: 'status',
          toStatus: 'draft',
          note: 'Proyecto creado',
          author: 'demo',
          createdAt: new Date(now.getTime() - (offsetDays + 5) * 86_400_000),
        },
        ...(status !== 'draft'
          ? [
              {
                id: `${id}_e1`,
                projectId: id,
                kind: 'status',
                fromStatus: 'draft',
                toStatus: status,
                note: 'Actualización de estado',
                author: 'demo',
                createdAt: new Date(now.getTime() - offsetDays * 86_400_000),
              },
            ]
          : []),
      ],
    };
  };
  const projects = [
    proj(
      1,
      'Iluminación del playón de barrio Norte',
      'infrastructure',
      'in_progress',
      'high',
      true,
      [
        ['Reflectores LED', 'Materiales', 1800000, 1200000],
        ['Instalación eléctrica', 'Mano de obra', 900000, 450000],
      ],
      'Nueva iluminación para uso nocturno.',
      30,
    ),
    proj(
      2,
      'Refacción de vestuarios del polideportivo',
      'infrastructure',
      'approved',
      'medium',
      true,
      [
        ['Materiales de obra', 'Materiales', 2600000, 0],
        ['Mano de obra', 'Mano de obra', 1400000, 0],
      ],
      'Vestuarios accesibles y duchas.',
      10,
    ),
    proj(
      3,
      'Juegos Deportivos Municipales 2027',
      'event',
      'budgeting',
      'high',
      false,
      [
        ['Premios y trofeos', 'Premios', 700000, 0],
        ['Arbitrajes', 'Servicios', 500000, 0],
      ],
      'Torneo inter-barrios con 8 disciplinas.',
      6,
    ),
    proj(
      4,
      'Cancha de césped sintético Barrio Sur',
      'infrastructure',
      'draft',
      'medium',
      false,
      [],
      'Anteproyecto, falta presupuesto.',
      2,
    ),
    proj(
      5,
      'Climatización de la pileta municipal',
      'infrastructure',
      'completed',
      'low',
      true,
      [['Equipo de climatización', 'Equipamiento', 3200000, 3350000]],
      'Obra finalizada.',
      90,
    ),
    proj(
      6,
      'Equipamiento para escuelitas deportivas',
      'equipment',
      'paused',
      'low',
      false,
      [['Pelotas y conos', 'Equipamiento', 450000, 150000]],
      'En pausa por falta de partida.',
      45,
    ),
  ];

  const announcements = [
    {
      id: `${P}ann1`,
      ...base,
      municipalityId: input.municipalityId,
      title: 'Abierta la inscripción a los Juegos Deportivos Municipales',
      body: 'Las instituciones pueden inscribir a sus equipos hasta fin de mes en la Secretaría de Deportes.',
      audience: 'all',
      pinned: true,
    },
    {
      id: `${P}ann2`,
      ...base,
      municipalityId: input.municipalityId,
      title: 'Recordatorio: renovar seguros y habilitaciones',
      body: 'Revisen en su panel la documentación por vencer. Sin seguro vigente no se pueden usar los espacios municipales.',
      audience: 'clubs',
      pinned: false,
    },
  ];

  return {
    prefix: P,
    clubs,
    teams,
    players,
    facilities,
    documents,
    requests,
    projects,
    announcements,
  };
}

/** Centro por defecto (zona norte del GBA) cuando el municipio no tiene ni contorno ni centro. */
export const DEFAULT_DEMO_CENTER: LatLng = [-34.4978, -58.6997];

/** Contorno ficticio, irregular pero estable, de ~9 km de ancho alrededor del centro. */
export function demoBoundary(center: LatLng, seedKey = 'demo'): LatLng[] {
  const r = rng(hash(seedKey));
  const n = 16;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 0.8 + 0.35 * r();
    return [
      center[0] + Math.sin(a) * 0.04 * k,
      center[1] + Math.cos(a) * 0.052 * k,
    ] as LatLng;
  });
}
