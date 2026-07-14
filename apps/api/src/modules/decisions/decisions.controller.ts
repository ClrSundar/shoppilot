import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

import { DecisionService } from './decisions.service';
import { RecommendSolutionDto } from './dto/recommend-solution.dto';
import { RecommendationFeedbackDto } from './dto/recommendation-feedback.dto';

@ApiTags('Decisions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('decisions')
export class DecisionController {
  constructor(private readonly decisionService: DecisionService) {}

  @Post('recommend-solution')
  @ApiOperation({
    summary: 'Recommend a solution for a customer query',
    description:
      'Matches ACTIVE decision rules against queryInputs, expands the solution template, ' +
      'ranks products deterministically, and returns a full audit trail.',
  })
  recommendSolution(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecommendSolutionDto,
  ) {
    return this.decisionService.recommendSolution(user.tenantId, user.sub, dto);
  }

  @Post('feedback')
  @ApiOperation({
    summary: 'Record recommendation feedback',
    description:
      'Stores operator feedback for a recommendation run (accepted/changed/rejected) for audit and pilot learning.',
  })
  recordFeedback(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecommendationFeedbackDto,
  ) {
    return this.decisionService.recordRecommendationFeedback(
      user.tenantId,
      user.sub,
      dto,
    );
  }

  @Get('history')
  @ApiOperation({
    summary: 'List recent recommendation runs',
    description:
      'Returns recent recommendation runs with customer context, top recommendation, quote linkage, and feedback.',
  })
  getRecommendationHistory(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
  ) {
    return this.decisionService.getRecommendationHistory(
      user.tenantId,
      limit ? Number(limit) : 20,
    );
  }
}
