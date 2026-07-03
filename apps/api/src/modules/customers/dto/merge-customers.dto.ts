import { IsNotEmpty, IsString } from 'class-validator';

export class MergeCustomersDto {
  @IsString()
  @IsNotEmpty()
  sourceCustomerId!: string;

  @IsString()
  @IsNotEmpty()
  targetCustomerId!: string;
}
