const TelegramBot = require('node-telegram-bot-api');
const { token, IS_WEBHOOK_MODE } = require('./src/config');
const { connectMongo } = require('./src/db');
const { createHealthServer, setupTelegramDeliveryMode } = require('./src/server');
const { startDailyReminderScheduler, startKeepAlive } = require('./src/scheduler');
const {
  registerSubscriber,
  sendMainMenu,
  startFlowByMenu,
  registerHandlers: registerConversationHandlers,
} = require('./src/features/conversation');
const {
  saveIncomeExpense,
  registerHandlers: registerIncomeExpenseHandlers,
} = require('./src/features/incomeExpense');
const { registerHandlers: registerTransferHandlers } = require('./src/features/transfer');
const { registerHandlers: registerHelpHandlers } = require('./src/features/help');
const { registerHandlers: registerStatisticsHandlers } = require('./src/features/statistics');
const { getMainMenuKeyboard } = require('./src/lib/keyboard');

const bot = new TelegramBot(token, { polling: !IS_WEBHOOK_MODE });

bot.on('polling_error', (error) => {
  const message = error?.message || '';
  if (message.includes('409 Conflict')) {
    console.error(
      'Bot instance khác đang chạy. Hãy tắt instance cũ rồi chạy lại tiến trình này.',
    );
    process.exit(1);
  }
  console.error('Polling error:', message);
});

async function setupBotCommands() {
  await bot.setMyCommands([
    { command: 'start', description: 'Mở menu thao tác nhanh' },
    { command: 'menu', description: 'Hiển thị menu nút bấm' },
    { command: 'thu', description: 'Bắt đầu ghi khoản thu' },
    { command: 'chi', description: 'Bắt đầu ghi khoản chi' },
    { command: 'rut', description: 'Bắt đầu ghi giao dịch rút tiền' },
    { command: 'nap', description: 'Bắt đầu ghi giao dịch nạp tiền' },
    { command: 'thongke', description: 'Xem thống kê tổng quát' },
    { command: 'reset', description: 'Xóa toàn bộ dữ liệu giao dịch' },
    { command: 'huy', description: 'Hủy thao tác đang nhập' },
    { command: 'help', description: 'Xem hướng dẫn sử dụng bot' },
  ]);
}

function registerAllHandlers() {
  const { clearConversation } = require('./src/features/conversation');

  registerConversationHandlers(bot);

  registerIncomeExpenseHandlers(bot, {
    registerSubscriber,
    clearConversation,
    saveIncomeExpense,
    startFlowByMenu: (cid, flow) => startFlowByMenu(bot, cid, flow),
  });

  registerTransferHandlers(bot, {
    registerSubscriber,
    clearConversation: require('./src/features/conversation').clearConversation,
    startFlowByMenu: (cid, flow) => startFlowByMenu(bot, cid, flow),
  });

  registerHelpHandlers(bot, {
    registerSubscriber,
    getMainMenuKeyboard,
  });

  registerStatisticsHandlers(bot, {
    registerSubscriber,
    sendMainMenu: (cid) => sendMainMenu(bot, cid),
  });
}

async function startBot() {
  createHealthServer(bot);
  await connectMongo();
  await setupTelegramDeliveryMode(bot);
  registerAllHandlers();
  await setupBotCommands();
  startDailyReminderScheduler(bot);
  startKeepAlive();
  console.log('Bot đang chạy với MongoDB...');
}

startBot().catch((error) => {
  console.error('Không thể kết nối MongoDB:', error.message);
  process.exit(1);
});
