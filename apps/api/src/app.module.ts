import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { EventsController } from './events.controller';

@Module({
  controllers: [HealthController, EventsController],
})
export class AppModule {}
