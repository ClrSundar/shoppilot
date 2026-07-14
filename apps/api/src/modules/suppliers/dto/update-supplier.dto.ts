import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateSupplierDto {
	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	phone?: string;

	@IsOptional()
	@IsEmail()
	email?: string;

	@IsOptional()
	@IsString()
	address?: string;

	@IsOptional()
	@IsString()
	@Matches(/^[0-9A-Z]{15}$/)
	gstNumber?: string;
}
