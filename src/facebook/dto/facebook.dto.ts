import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class PublishFacebookDto {
  @IsIn(['image', 'video', 'text']) kind!: 'image' | 'video' | 'text';
  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  url?: string;
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
}
