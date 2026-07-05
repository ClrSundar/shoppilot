import {
  IsString,
  IsOptional,
  IsNumber,
  IsObject,
  Min,
  IsPositive,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RecommendSolutionDto {
  /**
   * Freeform query inputs describing the customer's requirement.
   * Keys are attribute codes (e.g. "depth", "phase", "budget").
   * Values must be primitives: number, string, or boolean.
   */
  @ApiProperty({
    description: 'Query inputs matching rule conditions (e.g. depth, phase, budget)',
    example: { depth: 325, phase: 'SINGLE', budget: 15000 },
  })
  @IsObject()
  queryInputs: Record<string, string | number | boolean>;

  /**
   * Optional: link recommendation to a specific customer
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  /**
   * Optional: link recommendation to an active copilot session
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  copilotSessionId?: string;
}
