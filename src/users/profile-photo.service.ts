import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { photosByUid } from '../common/profile-photos';
import { MediaStorageService } from '../firebase/media-storage.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_PHOTO = 4_000_000;

/** Una sola foto de perfil por persona, la cargue el club o ella misma. */
@Injectable()
export class ProfilePhotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaStorageService,
  ) {}

  async mine(uid: string) {
    const photos = await photosByUid(this.prisma, [uid]);
    return { photoUrl: photos.get(uid) ?? null };
  }

  /**
   * Guarda la foto en todos los lugares donde la persona existe: su legajo de
   * staff, sus fichas del padrón y su perfil de profe. Así se ve igual en el
   * carnet, en la planilla del profe y en la consola del club.
   */
  async setMine(uid: string, photoUrl: unknown) {
    if (typeof photoUrl !== 'string' || !photoUrl.trim())
      throw new BadRequestException('Falta la foto');
    if (photoUrl.length > MAX_PHOTO)
      throw new BadRequestException('La foto es muy pesada');
    if (!/^(data:image\/|https:\/\/)/.test(photoUrl))
      throw new BadRequestException('Formato de foto no válido');
    const url = photoUrl.startsWith('data:')
      ? await this.media.externalize(photoUrl, `users/${uid}/photo`)
      : photoUrl;

    let places = 0;
    const staff = await this.prisma.storeDocument.findUnique({
      where: { path: `users/${uid}` },
      select: { id: true, data: true },
    });
    if (staff) {
      const data = (staff.data ?? {}) as Record<string, unknown>;
      await this.prisma.storeDocument.update({
        where: { id: staff.id },
        data: {
          data: {
            ...data,
            photoUrl: url,
            updatedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      places++;
    }
    const players = await this.prisma.player.updateMany({
      where: { OR: [{ authUid: uid }, { legacyId: uid }, { id: uid }] },
      data: { photoUrl: url },
    });
    places += players.count;
    const coach = await this.prisma.coachProfile.updateMany({
      where: { user: { firebaseUid: uid } },
      data: { photoUrl: url },
    });
    places += coach.count;
    if (!places)
      throw new BadRequestException(
        'Todavía no tenés una ficha donde guardar la foto.',
      );
    return { photoUrl: url };
  }
}
