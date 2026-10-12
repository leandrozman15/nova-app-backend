import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Un usuario libre solo puede pedir vínculos de "base": socio o jugador.
// Roles de staff (coach, manager...) se asignan desde el club, nunca se piden.
export const JOINABLE_ROLES = ['member', 'player'] as const;
export type JoinableRole = (typeof JOINABLE_ROLES)[number];

export class CreateJoinRequestDto {
  @IsString()
  @MaxLength(60)
  clubId!: string;

  @IsIn(JOINABLE_ROLES)
  role!: JoinableRole;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
