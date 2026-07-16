import { Module } from '@nestjs/common';
import { DiagnosticosController } from './diagnosticos.controller';
import { DiagnosticosService } from './diagnosticos.service';

@Module({
  controllers: [DiagnosticosController],
  providers: [DiagnosticosService],
})
export class DiagnosticosModule {}
