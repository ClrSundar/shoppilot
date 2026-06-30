import { IsIn } from 'class-validator';

export type QuoteStatus =
  | 'DRAFT'
  | 'SENT'
  | 'APPROVED'
  | 'INVOICED'
  | 'DISPATCHED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

const quoteStatuses: QuoteStatus[] = [
  'DRAFT',
  'SENT',
  'APPROVED',
  'INVOICED',
  'DISPATCHED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
];

export class UpdateQuoteStatusDto {
  @IsIn(quoteStatuses)
  status!: QuoteStatus;
}
