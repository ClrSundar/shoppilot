import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class GstRateConfigItemDto {
  @IsString()
  @Length(1, 32)
  classificationCode: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  ratePercentage: number;
}

export class UpdateGstConfigDto {
  @IsOptional()
  @IsString()
  @Length(1, 20)
  sellerGstin?: string;

  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  sellerStateCode: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GstRateConfigItemDto)
  rates: GstRateConfigItemDto[];
}
