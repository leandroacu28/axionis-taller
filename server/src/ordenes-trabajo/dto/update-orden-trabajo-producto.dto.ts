import { IsNumber, Max, Min } from 'class-validator';

export class UpdateOrdenTrabajoProductoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  cantidad: number;
}
