import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
  Param,
  Res,
} from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { Patch } from '@nestjs/common';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PdfService } from '../pdf/pdf.service';

@ApiTags('Quotes')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly pdfService: PdfService,
  ) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(user.tenantId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.quotesService.findAll(user.tenantId);
  }
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.quotesService.findOne(user.tenantId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateQuoteStatusDto,
  ) {
    return this.quotesService.updateStatus(user.tenantId, id, dto.status);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const quote = await this.quotesService.getQuotePdfData(user.tenantId, id);

    const doc = this.pdfService.generateQuotePdf(quote);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${quote.quoteNumber}.pdf"`,
    );

    doc.pipe(res);
  }
}
