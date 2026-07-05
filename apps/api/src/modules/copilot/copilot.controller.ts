import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CopilotChatDto } from './dto/copilot-chat.dto';
import { ConfirmDraftQuoteDto } from './dto/confirm-draft-quote.dto';
import { CopilotService } from './copilot.service';

@ApiTags('Copilot')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('copilot')
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Post('chat')
  chat(@CurrentUser() user: JwtPayload, @Body() dto: CopilotChatDto) {
    return this.copilotService.chat(
      user.tenantId,
      user.sub,
      dto.message,
      dto.sessionId,
      dto.previousMessages ?? [],
    );
  }

  @Get('sessions/latest')
  latestSession(@CurrentUser() user: JwtPayload) {
    return this.copilotService.getLatestSession(user.tenantId, user.sub);
  }

  @Get('sessions/:sessionId')
  getSession(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.copilotService.getSessionHistory(user.tenantId, user.sub, sessionId);
  }

  @Post('confirm-draft')
  confirmDraft(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConfirmDraftQuoteDto,
  ) {
    return this.copilotService.confirmDraftQuote(user.tenantId, user.sub, dto);
  }
}
