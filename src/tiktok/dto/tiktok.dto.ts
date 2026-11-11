import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class PublishTiktokDto {
  @IsString()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  url!: string;
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
}
