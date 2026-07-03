import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CopilotChatDto } from './dto/copilot-chat.dto';
import { CopilotService } from './copilot.service';

@ApiTags('Copilot')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('copilot')
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Post('chat')
  chat(@CurrentUser() user: JwtPayload, @Body() dto: CopilotChatDto) {
    return this.copilotService.chat(user.tenantId, dto.message);
  }
}
