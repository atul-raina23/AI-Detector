import { Module } from '@nestjs/common';
import { AuthModule } from '@eos/auth';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AuthModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
