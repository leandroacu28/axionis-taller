import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import { SECTION_ACCESS_LEVELS, SECTION_IDS } from '../section-catalog';

export class RoleSectionEntryDto {
  @IsString()
  @IsIn(SECTION_IDS as unknown as string[])
  sectionId: string;

  @IsIn(SECTION_ACCESS_LEVELS as unknown as string[])
  level: string;
}

export class PutRoleGridDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RoleSectionEntryDto)
  sections: RoleSectionEntryDto[];
}
