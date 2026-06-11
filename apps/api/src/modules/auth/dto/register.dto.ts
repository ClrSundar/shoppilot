import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

import { BusinessType } from '@prisma/client';

export class RegisterDto {
  @IsString()
  shopName: string;

  @IsString()
  shopCode: string;

  @IsEnum(BusinessType)
  businessType: BusinessType;

  @IsString()
  ownerName: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}
