import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CopilotChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;
}
