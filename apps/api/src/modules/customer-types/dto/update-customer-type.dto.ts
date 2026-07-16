import { PartialType } from '@nestjs/swagger';

import { CreateCustomerTypeDto } from './create-customer-type.dto';

export class UpdateCustomerTypeDto extends PartialType(CreateCustomerTypeDto) {}
