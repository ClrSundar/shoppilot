import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class WhatsAppWebhookDto {
  @IsString()
  @IsNotEmpty()
  tenantCode!: string;

  @IsString()
  @IsNotEmpty()
  from!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  messageId?: string;
}
