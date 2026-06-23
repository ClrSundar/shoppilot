import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.usersService.getCurrentUser(user.sub);
  }

  @Get()
  listUsers(@CurrentUser() user: JwtPayload) {
    return this.usersService.listUsers(user.tenantId);
  }

  @Post()
  createUser(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(user.tenantId, user.role, dto);
  }

  @Patch(':id/role')
  updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(user.tenantId, user.sub, user.role, id, dto);
  }

  @Patch(':id/toggle-active')
  toggleActive(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.usersService.toggleActive(user.tenantId, user.sub, user.role, id);
  }
}
