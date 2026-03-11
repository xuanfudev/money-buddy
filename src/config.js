require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('Thiếu TELEGRAM_BOT_TOKEN trong biến môi trường.');
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'money_buddy';
const COLLECTION_NAME = 'transactions';
const SUBSCRIBERS_COLLECTION_NAME = 'subscribers';
const REMINDER_TIME = process.env.DAILY_REMINDER_TIME || '22:00';
const REMINDER_TIMEZONE = process.env.REMINDER_TIMEZONE || 'Asia/Ho_Chi_Minh';
const PORT = Number.parseInt(process.env.PORT || '10000', 10);
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || '';
const SLEEP_START_HOUR = Number.parseInt(
  process.env.KEEP_ALIVE_SLEEP_START || '23',
  10,
);
const SLEEP_END_HOUR = Number.parseInt(
  process.env.KEEP_ALIVE_SLEEP_END || '6',
  10,
);
const USE_TELEGRAM_WEBHOOK =
  (process.env.USE_TELEGRAM_WEBHOOK || 'true').toLowerCase() === 'true';
const WEBHOOK_PATH =
  process.env.TELEGRAM_WEBHOOK_PATH || `/telegram-webhook/${token}`;
const IS_WEBHOOK_MODE = USE_TELEGRAM_WEBHOOK && Boolean(RENDER_EXTERNAL_URL);

const ACCOUNT_CASH = 'cash';
const ACCOUNT_BANK = 'bank';
const TRANSFER_BANK_TO_CASH = 'bank_to_cash';
const TRANSFER_CASH_TO_BANK = 'cash_to_bank';

const BUTTON_THU = '➕ Thu';
const BUTTON_CHI = '➖ Chi';
const BUTTON_RUT = '🏧 Rút';
const BUTTON_NAP = '🏦 Nạp';
const BUTTON_THONGKE = '📈 Thống kê';
const BUTTON_HELP = '📘 Help';
const BUTTON_HUY = '❌ Hủy';

const PERIOD_LABELS = { day: 'Hôm nay', week: 'Tuần', month: 'Tháng', year: 'Năm' };

module.exports = {
  token,
  MONGODB_URI,
  DB_NAME,
  COLLECTION_NAME,
  SUBSCRIBERS_COLLECTION_NAME,
  REMINDER_TIME,
  REMINDER_TIMEZONE,
  PORT,
  RENDER_EXTERNAL_URL,
  SLEEP_START_HOUR,
  SLEEP_END_HOUR,
  USE_TELEGRAM_WEBHOOK,
  WEBHOOK_PATH,
  IS_WEBHOOK_MODE,
  ACCOUNT_CASH,
  ACCOUNT_BANK,
  TRANSFER_BANK_TO_CASH,
  TRANSFER_CASH_TO_BANK,
  BUTTON_THU,
  BUTTON_CHI,
  BUTTON_RUT,
  BUTTON_NAP,
  BUTTON_THONGKE,
  BUTTON_HELP,
  BUTTON_HUY,
  PERIOD_LABELS,
};
