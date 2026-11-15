import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMunicipalitySettingsDto } from './dto/update-municipality-settings.dto';

const check = async (o: object) => (await validate(plainToInstance(UpdateMunicipalitySettingsDto, o), { whitelist: true, forbidNonWhitelisted: true })).length;

describe('UpdateMunicipalitySettingsDto', () => {
  it('acepta datos válidos', async () => {
    expect(await check({ secretariaName: 'Secretaría de Deportes', contactEmail: 'deportes@muni.gob.ar', phone: '+54 11 4000-0000', facebook: 'https://facebook.com/muni', logoUrl: 'data:image/png;base64,iVBORw0KGgo=' })).toBe(0);
  });
  it('acepta vacío para borrar un dato', async () => {
    expect(await check({ logoUrl: '', contactEmail: '', website: '', facebook: '', phone: '' })).toBe(0);
  });
  it('rechaza logos que no son imagen, javascript: y enlaces http', async () => {
    expect(await check({ logoUrl: 'javascript:alert(1)' })).toBeGreaterThan(0);
    expect(await check({ logoUrl: 'data:text/html;base64,PHNjcmlwdD4=' })).toBeGreaterThan(0);
    expect(await check({ logoUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBeGreaterThan(0);
    expect(await check({ website: 'http://muni.gob.ar' })).toBeGreaterThan(0);
    expect(await check({ instagram: 'javascript:alert(1)' })).toBeGreaterThan(0);
  });
  it('rechaza campos que no son de configuración (p. ej. companyId)', async () => {
    expect(await check({ companyId: 'otra' })).toBeGreaterThan(0);
  });
});
