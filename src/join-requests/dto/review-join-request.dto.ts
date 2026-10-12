import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  JOINABLE_ROLES,
  type JoinableRole,
} from '../../users/dto/create-join-request.dto';

export class ApproveJoinRequestDto {
  /** Permite al club corregir el rol pedido (socio ↔ jugador). */
  @IsOptional()
  @IsIn(JOINABLE_ROLES)
  role?: JoinableRole;

  /** Ficha de jugador ya cargada en el padrón a la que se vincula la cuenta. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  playerId?: string;

  /** Ficha de socio ya cargada en el padrón a la que se vincula la cuenta. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  memberId?: string;
}

export class RejectJoinRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
