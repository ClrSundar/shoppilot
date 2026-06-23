import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { WhatsAppWebhookDto } from './dto/whatsapp-webhook.dto';
import { WhatsappService } from './whatsapp.service';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('webhook')
  handleWebhook(@Body() payload: WhatsAppWebhookDto) {
    return this.whatsappService.handleIncomingMessage(payload);
  }
}
