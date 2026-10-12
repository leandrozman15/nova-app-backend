import { IsNotEmpty, IsString } from 'class-validator';

export class SetActiveClubContextDto {
  @IsString()
  @IsNotEmpty()
  clubId!: string;
}