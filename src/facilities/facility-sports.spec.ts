import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateFacilityDto } from './dto/update-facility.dto';
import {
  FACILITY_SPORTS,
  FACILITY_SPORT_FAMILIES,
  facilitySportFamily,
} from './facility-sports';

describe('facility sports catalog', () => {
  it('has unique ids and every variant belongs to a known family', () => {
    const ids = FACILITY_SPORTS.map((sport) => sport.id);
    expect(new Set(ids).size).toBe(ids.length);
    const families = new Set<string>(FACILITY_SPORT_FAMILIES.map((f) => f.id));
    FACILITY_SPORTS.forEach((sport) => expect(families.has(sport.family)).toBe(true));
    expect(facilitySportFamily('futbol_7')).toBe('football');
  });

  it('accepts catalog sports and null, rejects anything else', async () => {
    const check = (sport: unknown) =>
      validate(plainToInstance(UpdateFacilityDto, { sport }));
    expect(await check('futbol_5')).toHaveLength(0);
    expect(await check(null)).toHaveLength(0);
    expect(await check('futbol_99')).not.toHaveLength(0);
  });
});
