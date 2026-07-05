import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

import { DecisionService } from './decisions.service';
import { RecommendSolutionDto } from './dto/recommend-solution.dto';

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
}
