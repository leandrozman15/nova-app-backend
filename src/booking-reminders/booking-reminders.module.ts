import { Module } from '@nestjs/common';

import { PushModule } from '../push/push.module';
import { BookingRemindersController, BookingRemindersCronController } from './booking-reminders.controller';
import { BookingRemindersService } from './booking-reminders.service';

@Module({
  imports: [PushModule],
  controllers: [BookingRemindersController, BookingRemindersCronController],
  providers: [BookingRemindersService],
})
export class BookingRemindersModule {}
