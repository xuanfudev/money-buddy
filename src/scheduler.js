const cron = require('node-cron');
const {
  REMINDER_TIME,
  REMINDER_TIMEZONE,
  RENDER_EXTERNAL_URL,
  SLEEP_START_HOUR,
  SLEEP_END_HOUR,
  IS_WEBHOOK_MODE,
} = require('./config');
const { getSubscribersCollection } = require('./db');
const { parseReminderTime, getCurrentHourInTimezone } = require('./lib/date');
const { getDetailedReportData, formatSummaryMessage } = require('./features/statistics');

async function sendDailyReminder(bot) {
  const subscribersCollection = getSubscribersCollection();
  const subscribers = await subscribersCollection.find({}).toArray();
  if (subscribers.length === 0) return;

  const report = await getDetailedReportData();
  const message = formatSummaryMessage(
    report,
    `📊 BÁO CÁO ${REMINDER_TIME} HẰNG NGÀY`,
  );

  await Promise.all(
    subscribers.map((subscriber) =>
      bot.sendMessage(subscriber.chatId, message),
    ),
  );
}

function startDailyReminderScheduler(bot) {
  const parsedTime = parseReminderTime(REMINDER_TIME);
  if (!parsedTime) {
    throw new Error(
      'DAILY_REMINDER_TIME không hợp lệ. Dùng định dạng HH:mm, ví dụ 22:20',
    );
  }

  const cronExpression = `${parsedTime.minute} ${parsedTime.hour} * * *`;
  cron.schedule(
    cronExpression,
    async () => {
      try {
        await sendDailyReminder(bot);
      } catch (error) {
        console.error('Không thể gửi thông báo hằng ngày:', error.message);
      }
    },
    { timezone: REMINDER_TIMEZONE },
  );

  console.log(
    `Đã bật nhắc nhở hằng ngày lúc ${REMINDER_TIME} (${REMINDER_TIMEZONE}).`,
  );
}

function isInSleepWindow() {
  const hour = getCurrentHourInTimezone(REMINDER_TIMEZONE);
  if (SLEEP_START_HOUR > SLEEP_END_HOUR) {
    return hour >= SLEEP_START_HOUR || hour < SLEEP_END_HOUR;
  }
  return hour >= SLEEP_START_HOUR && hour < SLEEP_END_HOUR;
}

function startKeepAlive() {
  const http = require('http');
  const https = require('https');

  if (IS_WEBHOOK_MODE) {
    console.log('Đang dùng webhook, không bật keep-alive cron.');
    return;
  }

  if (!RENDER_EXTERNAL_URL) {
    console.log('RENDER_EXTERNAL_URL chưa được cấu hình. Bỏ qua keep-alive.');
    return;
  }

  const url = `${RENDER_EXTERNAL_URL}/healthz`;
  const client = url.startsWith('https') ? https : http;

  cron.schedule(
    '*/14 * * * *',
    () => {
      if (isInSleepWindow()) {
        console.log('Đang trong giờ nghỉ, bỏ qua keep-alive ping.');
        return;
      }

      client
        .get(url, (res) => {
          console.log(`Keep-alive ping: ${res.statusCode}`);
        })
        .on('error', (err) => {
          console.error('Keep-alive ping lỗi:', err.message);
        });
    },
    { timezone: REMINDER_TIMEZONE },
  );

  console.log(
    `Keep-alive đã bật: ping mỗi 14 phút, nghỉ từ ${SLEEP_START_HOUR}:00 đến ${SLEEP_END_HOUR}:00 (${REMINDER_TIMEZONE}).`,
  );
}

module.exports = {
  startDailyReminderScheduler,
  startKeepAlive,
};
