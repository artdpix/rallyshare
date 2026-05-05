import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { EventsController } from './events.controller';
import { SubmissionsController } from './submissions.controller';
import { AdminController } from './admin.controller';

@Module({
  controllers: [
    HealthController,
    EventsController,
    SubmissionsController,
    AdminController,
  ],
})
export class AppModule {}
