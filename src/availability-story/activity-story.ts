/**
 * Historia de una actividad o disciplina: horarios por grupo, profes, valor e "inscripciones abiertas".
 * Sin efectos: arma los datos; el dibujo está en story-render.ts.
 */

export type Slot = { day: number; start: string; end: string };

/** Lunes = 0 … domingo = 6 (como guarda la app los horarios de actividades). */
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const join = (items: string[]) =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;

/** "Lun y Mié · 18:00 a 19:30": une los días que comparten horario. */
export function scheduleLines(slots: Slot[]): string[] {
  const groups = new Map<string, number[]>();
  for (const s of [...slots].sort(
    (a, b) => a.day - b.day || a.start.localeCompare(b.start),
  )) {
    if (!(s.day >= 0 && s.day <= 6) || !s.start || !s.end) continue;
    const key = `${s.start} a ${s.end}`;
    groups.set(key, [...new Set([...(groups.get(key) ?? []), s.day])]);
  }
  return [...groups.entries()]
    .sort(
      (a, b) =>
        Math.min(...a[1]) - Math.min(...b[1]) || a[0].localeCompare(b[0]),
    )
    .map(
      ([hours, days]) =>
        `${join(days.sort((x, y) => x - y).map((d) => DAYS[d]))} · ${hours}`,
    );
}

const UNIT: Record<string, string> = {
  mes: 'por mes',
  clase: 'por clase',
  semana: 'por semana',
  trimestre: 'por trimestre',
  año: 'por año',
};

export function priceLabel(
  price: number | null | undefined,
  unit?: string | null,
) {
  if (price === null || price === undefined || !(price > 0)) return null;
  const amount = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(price);
  return `${amount}${unit && UNIT[unit] ? ` ${UNIT[unit]}` : ''}`;
}

export type ActivityGroup = {
  name: string;
  lines: string[];
  coaches: string[];
};

export type ActivityStoryData = {
  clubName: string;
  logo?: string | null;
  cover?: string | null;
  contact?: string | null;
  title: string;
  emoji?: string | null;
  audience?: string | null;
  highlight?: string | null;
  price?: string | null;
  /** Llamado del pie ("Inscribite", "Pedí tu clase"). */
  footTitle?: string | null;
  groups: ActivityGroup[];
};

/** Fuente: disciplina (con sus categorías) o actividad suelta, como las lista la consola. */
export type ActivitySource = {
  id: string;
  name: string;
  emoji?: string | null;
  audience?: string | null;
  coaches?: string[];
  schedule?: Slot[];
  /** `lines` ya armadas (campeonatos, clases del profe) en lugar de horarios por día. */
  groups?: {
    name: string;
    schedule: Slot[];
    coaches: string[];
    lines?: string[];
  }[];
  price?: number | null;
  priceUnit?: string | null;
};

export const MAX_GROUPS = 5;

export function activityStoryGroups(
  source: ActivitySource,
  pick?: string[],
): ActivityGroup[] {
  const groups = source.groups?.length
    ? source.groups
    : [
        {
          name: '',
          schedule: source.schedule ?? [],
          coaches: source.coaches ?? [],
        },
      ];
  const chosen = pick?.length
    ? groups.filter((g) => pick.includes(g.name))
    : groups;
  return chosen
    .map((g) => ({
      name: g.name,
      lines: g.lines ?? scheduleLines(g.schedule),
      coaches: (g.coaches.length
        ? g.coaches
        : g.lines
          ? []
          : (source.coaches ?? [])
      ).slice(0, 3),
    }))
    .filter((g) => g.lines.length > 0 || g.coaches.length > 0)
    .slice(0, MAX_GROUPS);
}

export function activityCaption(
  d: Pick<
    ActivityStoryData,
    'clubName' | 'title' | 'highlight' | 'groups' | 'price' | 'contact'
  >,
) {
  const lines = [`${d.title} en ${d.clubName}`];
  if (d.highlight) lines.push(d.highlight);
  for (const g of d.groups) {
    lines.push('');
    if (g.name) lines.push(g.name);
    lines.push(...g.lines);
    if (g.coaches.length) lines.push(`Profe: ${g.coaches.join(', ')}`);
  }
  if (d.price) lines.push('', d.price);
  if (d.contact) lines.push('', `Inscripciones: ${d.contact}`);
  return lines.join('\n');
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const money = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
const ddmm = (date: string) => date.split('-').reverse().slice(0, 2).join('/');
const dayOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};
const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const ENTRY: Record<string, string> = {
  individual: 'Individual',
  pareja: 'Parejas',
  equipo: 'Equipos',
};

/** Campeonato abierto del club como historia: fechas, inscripción, sede y premios. */
export function tournamentSource(t: {
  id: string;
  name: string;
  category: string | null;
  entryType: string;
  days: unknown;
  venues: unknown;
  registrationFee: number | null;
  feeUnit: string | null;
  registrationDeadline: string | null;
  prizes: string[];
  spotsLeft: number | null;
}): ActivitySource {
  const days = (Array.isArray(t.days) ? t.days : []) as {
    date?: string;
    start?: string;
    end?: string;
  }[];
  const when = days
    .filter((d) => d.date)
    .slice(0, 4)
    .map(
      (d) =>
        `${dayOf(d.date!)} ${ddmm(d.date!)}${d.start ? ` · ${d.start}${d.end ? ` a ${d.end}` : ''}` : ''}`,
    );
  const venue = (
    (Array.isArray(t.venues) ? t.venues : []) as { name?: string }[]
  )
    .map((v) => v.name)
    .filter(Boolean)[0];
  const signup = [
    t.registrationFee
      ? `${money(t.registrationFee)}${t.feeUnit ? ` ${t.feeUnit}` : ''}`
      : 'Inscripción sin cargo',
    t.registrationDeadline ? `Hasta el ${ddmm(t.registrationDeadline)}` : null,
    t.spotsLeft !== null && t.spotsLeft <= 10
      ? `Quedan ${t.spotsLeft} lugares`
      : null,
  ].filter((x): x is string => Boolean(x));
  return {
    id: `torneo:${t.id}`,
    name: t.name,
    emoji: '🏆',
    audience:
      [t.category, ENTRY[t.entryType]].filter(Boolean).join(' · ') ||
      'Campeonato',
    groups: [
      {
        name: venue ? `Cuándo · ${venue}` : 'Cuándo',
        schedule: [],
        coaches: [],
        lines: when.length ? when : ['Fecha a confirmar'],
      },
      { name: 'Inscripción', schedule: [], coaches: [], lines: signup },
      ...(t.prizes.length
        ? [
            {
              name: 'Premios',
              schedule: [],
              coaches: [],
              lines: t.prizes.slice(0, 3),
            },
          ]
        : []),
    ],
    price: null,
    priceUnit: null,
  };
}

const FORMAT: Record<string, string> = {
  INDIVIDUAL: 'Individual',
  DUO: 'Dúo',
  GROUP: 'Grupal',
};

/** Profe de pádel del club como historia: clases con precio, días y horarios, y grupales con lugar. */
export function coachSource(c: {
  id: string;
  displayName: string;
  levels: string[];
  classTypes: {
    name: string;
    format: string;
    price: number;
    durationMinutes: number;
  }[];
  weekly: { weekday: number; startMinute: number; endMinute: number }[];
  groups: {
    date: string;
    startMinute: number;
    name: string;
    spotsLeft: number;
  }[];
}): ActivitySource {
  // Lunes = 0 en los horarios de historias; los del profe usan domingo = 0.
  const schedule = c.weekly.map((w) => ({
    day: (w.weekday + 6) % 7,
    start: hhmm(w.startMinute),
    end: hhmm(w.endMinute),
  }));
  const levels =
    c.levels.length > 4
      ? 'Todos los niveles'
      : c.levels.map((l) => (l === 'iniciacion' ? 'Iniciación' : l)).join(', ');
  return {
    id: `profe:${c.id}`,
    name: `Clases de pádel con ${c.displayName}`,
    emoji: '🎾',
    audience: levels || 'Clases de pádel',
    groups: [
      {
        name: 'Clases',
        schedule: [],
        coaches: [],
        lines: c.classTypes
          .slice(0, 4)
          .map(
            (t) =>
              `${t.name} · ${money(t.price)}${t.format === 'GROUP' ? ' c/u' : ''}`,
          ),
      },
      ...(schedule.length
        ? [{ name: 'Días y horarios', schedule, coaches: [] }]
        : []),
      ...(c.groups.length
        ? [
            {
              name: 'Grupales con lugar',
              schedule: [],
              coaches: [],
              lines: c.groups
                .slice(0, 3)
                .map(
                  (g) =>
                    `${dayOf(g.date)} ${ddmm(g.date)} · ${hhmm(g.startMinute)} · ${g.spotsLeft} ${g.spotsLeft === 1 ? 'lugar' : 'lugares'}`,
                ),
            },
          ]
        : []),
    ],
    price: null,
    priceUnit: null,
  };
}
