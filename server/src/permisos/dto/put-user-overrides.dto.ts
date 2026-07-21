import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsIn, IsString, ValidateIf, ValidateNested,
} from 'class-validator';
import { SECTION_ACCESS_LEVELS, SECTION_IDS } from '../section-catalog';

export class UserOverrideEntryDto {
  @IsString()
  @IsIn(SECTION_IDS as unknown as string[])
  sectionId: string;

  // null clears the override (falls back to role default). @ValidateIf skips the
  // @IsIn check only when level === null, so any other invalid value still 400s.
  @ValidateIf((o) => o.level !== null)
  @IsIn(SECTION_ACCESS_LEVELS as unknown as string[])
  level: string | null;
}

export class PutUserOverridesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UserOverrideEntryDto)
  sections: UserOverrideEntryDto[];
}
