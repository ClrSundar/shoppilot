import { IsOptional, IsString } from 'class-validator';

export class RejectTenantDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
