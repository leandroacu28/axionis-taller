import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PutRoleGridDto } from './dto/put-role-grid.dto';
import { PutUserOverridesDto } from './dto/put-user-overrides.dto';
import { PermisosService } from './permisos.service';

@Controller('permisos')
@UseGuards(JwtAuthGuard)
export class PermisosController {
  constructor(private readonly permisosService: PermisosService) {}

  @Get('roles/:rol')
  async getRoleGrid(@Param('rol') rol: string) {
    return this.permisosService.getRoleGrid(rol);
  }

  @Put('roles/:rol')
  async putRoleGrid(@Param('rol') rol: string, @Body() dto: PutRoleGridDto) {
    return this.permisosService.putRoleGrid(rol, dto);
  }

  @Get('users/:userId')
  async getUserGrid(@Param('userId', ParseIntPipe) userId: number) {
    return this.permisosService.getUserGrid(userId);
  }

  @Put('users/:userId')
  async putUserGrid(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: PutUserOverridesDto,
  ) {
    return this.permisosService.putUserGrid(userId, dto);
  }
}
