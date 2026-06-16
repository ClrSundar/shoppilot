import { IsEmail, MinLength, IsOptional, IsUUID } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
