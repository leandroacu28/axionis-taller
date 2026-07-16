import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { ColorsModule } from './colors/colors.module';
import { DiagnosticosModule } from './diagnosticos/diagnosticos.module';
import { BrandsModule } from './brands/brands.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ServiceTypesModule } from './service-types/service-types.module';
import { UnidadesMedidaModule } from './unidades-medida/unidades-medida.module';
import { ProductosModule } from './productos/productos.module';
import { EtiquetasModule } from './etiquetas/etiquetas.module';
import { OrdenesTrabajoModule } from './ordenes-trabajo/ordenes-trabajo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    ColorsModule,
    DiagnosticosModule,
    BrandsModule,
    VehiclesModule,
    ServiceTypesModule,
    UnidadesMedidaModule,
    ProductosModule,
    EtiquetasModule,
    OrdenesTrabajoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
