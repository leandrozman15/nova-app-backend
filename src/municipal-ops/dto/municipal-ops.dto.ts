import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { DOCUMENT_KINDS, REQUEST_STATUSES, REQUEST_TYPES } from '../municipal-ops-rules';

export class CreateAnnouncementDto {
  @IsString() municipalityId!: string;
  @IsString() @MaxLength(140) title!: string;
  @IsString() @MaxLength(4000) body!: string;
  @IsOptional() @IsIn(['all', 'clubs', 'families']) audience?: string;
  @IsOptional() pinned?: boolean;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class CreateDocumentDto {
  @IsString() clubId!: string;
  @IsIn(DOCUMENT_KINDS as unknown as string[]) kind!: string;
  @IsString() @MaxLength(140) title!: string;
  @IsOptional() @IsDateString() issuedAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(500) fileUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreateRequestDto {
  @IsString() clubId!: string;
  @IsIn(REQUEST_TYPES as unknown as string[]) type!: string;
  @IsString() @MaxLength(140) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000) amountRequested?: number;
}

export class ResolveRequestDto {
  @IsIn(REQUEST_STATUSES as unknown as string[]) status!: string;
  @IsOptional() @IsString() @MaxLength(1000) resolutionNote?: string;
}

export class AddReceiptDto {
  @IsString() @MaxLength(140) concept!: string;
  @IsInt() @Min(1) @Max(2_000_000_000) amount!: number;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(500) fileUrl?: string;
}

export class RecordAuditDto {
  @IsString() municipalityId!: string;
  @IsIn(['dni_reveal', 'export']) action!: string;
  @IsString() @MaxLength(60) entity!: string;
  @IsOptional() @IsString() @MaxLength(80) entityId?: string;
  @IsOptional() @IsString() @MaxLength(200) summary?: string;
}
