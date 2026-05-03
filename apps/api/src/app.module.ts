import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { EventsController } from './events.controller';
import { SubmissionsController } from './submissions.controller';

@Module({
  controllers: [HealthController, EventsController, SubmissionsController],
})
export class AppModule {}
