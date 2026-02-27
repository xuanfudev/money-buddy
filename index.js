const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const cron = require('node-cron');
const http = require('http');
const https = require('https');
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

const bot = new TelegramBot(token, { polling: !IS_WEBHOOK_MODE });

let mongoClient;
let transactionsCollection;
let subscribersCollection;
const conversationStates = new Map();

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

async function connectMongo() {
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db(DB_NAME);
  transactionsCollection = db.collection(COLLECTION_NAME);
  subscribersCollection = db.collection(SUBSCRIBERS_COLLECTION_NAME);
}

function normalizePath(rawPath) {
  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
}

async function handleWebhookRequest(req, res) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));

  req.on('end', async () => {
    try {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const update = bodyText ? JSON.parse(bodyText) : {};
      await bot.processUpdate(update);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      console.error('Webhook update lỗi:', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false }));
    }
  });
}

function startHealthServer() {
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    const webhookPath = normalizePath(WEBHOOK_PATH);

    if (req.method === 'POST' && pathname === webhookPath && IS_WEBHOOK_MODE) {
      await handleWebhookRequest(req, res);
      return;
    }

    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Money Buddy bot is running');
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Health server đang lắng nghe cổng ${PORT}.`);
  });
}

async function setupTelegramDeliveryMode() {
  if (!IS_WEBHOOK_MODE) {
    await bot.deleteWebHook({ drop_pending_updates: false });
    console.log('Bot chạy ở chế độ polling.');
    return;
  }

  const baseUrl = RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  const webhookPath = normalizePath(WEBHOOK_PATH);
  const webhookUrl = `${baseUrl}${webhookPath}`;

  await bot.setWebHook(webhookUrl);
  console.log(`Bot chạy ở chế độ webhook: ${webhookUrl}`);
}

// Format tiền
function parseMoney(text) {
  text = text.toLowerCase();
  if (text.includes('k')) return Number.parseInt(text, 10) * 1000;
  if (text.includes('tr')) return Number.parseInt(text, 10) * 1000000;
  return Number.parseInt(text, 10);
}

function parseAccountToken(text) {
  const tokenText = text.trim().toLowerCase();
  if (['tm', 'tienmat', 'cash', 'tiền mặt'].includes(tokenText)) {
    return ACCOUNT_CASH;
  }

  if (['tk', 'taikhoan', 'bank', 'tài khoản'].includes(tokenText)) {
    return ACCOUNT_BANK;
  }

  return null;
}

function parseInlineIncomeExpenseInput(input) {
  const [amountText, ...parts] = input.trim().split(/\s+/);
  const amount = parseMoney(amountText || '');

  let account = ACCOUNT_CASH;
  if (parts.length > 0) {
    const parsedAccount = parseAccountToken(parts[0]);
    if (parsedAccount) {
      account = parsedAccount;
      parts.shift();
    }
  }

  const reason = parts.join(' ').trim();
  return { amount, account, reason };
}

function parseInlineTransferInput(input) {
  const [amountText, ...parts] = input.trim().split(/\s+/);
  const amount = parseMoney(amountText || '');
  const reason = parts.join(' ').trim();
  return { amount, reason };
}

function startConversation(chatId, flow) {
  conversationStates.set(chatId, { flow, step: 'amount' });
}

function clearConversation(chatId) {
  conversationStates.delete(chatId);
}

function getMainMenuKeyboard() {
  return {
    keyboard: [
      [BUTTON_THU, BUTTON_CHI],
      [BUTTON_RUT, BUTTON_NAP],
      [BUTTON_THONGKE, BUTTON_HELP],
      [BUTTON_HUY],
    ],
    resize_keyboard: true,
  };
}

function getConversationKeyboard() {
  return {
    keyboard: [[BUTTON_HUY]],
    resize_keyboard: true,
  };
}

function isMenuButton(text) {
  return [
    BUTTON_THU,
    BUTTON_CHI,
    BUTTON_RUT,
    BUTTON_NAP,
    BUTTON_THONGKE,
    BUTTON_HELP,
    BUTTON_HUY,
  ].includes(text);
}

async function sendMainMenu(chatId, text = 'Chọn thao tác bên dưới:') {
  await bot.sendMessage(chatId, text, {
    reply_markup: getMainMenuKeyboard(),
  });
}

function parseReminderTime(timeText) {
  const match = /^(\d{2}):(\d{2})$/.exec(timeText);
  if (!match) {
    return null;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

async function registerSubscriber(chatId) {
  await subscribersCollection.updateOne(
    { chatId },
    {
      $set: { chatId, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}

function getBalanceByAccount(rows, account) {
  const income =
    rows.find((x) => x._id.type === 'income' && x._id.account === account)
      ?.total || 0;
  const expense =
    rows.find((x) => x._id.type === 'expense' && x._id.account === account)
      ?.total || 0;

  return income - expense;
}

function getTransferAmount(rows, direction) {
  return rows.find((x) => x._id === direction)?.total || 0;
}

function accountLabel(account) {
  return account === ACCOUNT_BANK ? 'Tài khoản' : 'Tiền mặt';
}

async function getDetailedReportData() {
  const [result] = await transactionsCollection
    .aggregate([
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: '$type',
                total: { $sum: '$amount' },
              },
            },
          ],
          byAccount: [
            {
              $group: {
                _id: {
                  type: '$type',
                  account: { $ifNull: ['$account', ACCOUNT_CASH] },
                },
                total: { $sum: '$amount' },
              },
            },
          ],
          topExpenses: [
            { $match: { type: 'expense' } },
            {
              $project: {
                _id: 0,
                amount: 1,
                reason: 1,
                account: { $ifNull: ['$account', ACCOUNT_CASH] },
              },
            },
            { $sort: { amount: -1 } },
            { $limit: 3 },
          ],
          transfers: [
            { $match: { type: 'transfer' } },
            {
              $group: {
                _id: '$direction',
                total: { $sum: '$amount' },
              },
            },
          ],
          transactionCount: [{ $count: 'count' }],
        },
      },
    ])
    .toArray();

  const totals = result?.totals || [];
  const byAccount = result?.byAccount || [];
  const topExpenses = result?.topExpenses || [];
  const transfers = result?.transfers || [];
  const transactionCount = result?.transactionCount?.[0]?.count || 0;

  const income = totals.find((x) => x._id === 'income')?.total || 0;
  const expense = totals.find((x) => x._id === 'expense')?.total || 0;
  const bankToCash = getTransferAmount(transfers, TRANSFER_BANK_TO_CASH);
  const cashToBank = getTransferAmount(transfers, TRANSFER_CASH_TO_BANK);
  const cashBalance =
    getBalanceByAccount(byAccount, ACCOUNT_CASH) + bankToCash - cashToBank;
  const bankBalance =
    getBalanceByAccount(byAccount, ACCOUNT_BANK) - bankToCash + cashToBank;
  const totalBalance = cashBalance + bankBalance;

  return {
    income,
    expense,
    cashBalance,
    bankBalance,
    totalBalance,
    transactionCount,
    topExpenses,
  };
}

function formatOverviewMessage(data) {
  return `📈 THỐNG KÊ TỔNG QUÁT
-------------------
Tổng giao dịch: ${data.transactionCount}
Tổng thu: ${data.income.toLocaleString()}đ
Tổng chi: ${data.expense.toLocaleString()}đ
Số dư tiền mặt: ${data.cashBalance.toLocaleString()}đ
Số dư tiền tài khoản: ${data.bankBalance.toLocaleString()}đ
Tổng số dư: ${data.totalBalance.toLocaleString()}đ`;
}

function formatSummaryMessage(data, title = '📊 THỐNG KÊ') {
  const topExpenseLines =
    data.topExpenses.length === 0
      ? ['- Chưa có khoản chi nào']
      : data.topExpenses.map(
          (item, index) =>
            `${index + 1}. ${item.amount.toLocaleString()}đ - ${item.reason || 'Không có lý do'} (${accountLabel(item.account)})`,
        );

  return `${title}
-------------------
Tổng thu: ${data.income.toLocaleString()}đ
Tổng chi: ${data.expense.toLocaleString()}đ
Số dư tiền mặt: ${data.cashBalance.toLocaleString()}đ
Số dư tiền tài khoản: ${data.bankBalance.toLocaleString()}đ
Tổng số dư: ${data.totalBalance.toLocaleString()}đ

Top 3 khoản chi lớn nhất:
${topExpenseLines.join('\n')}`;
}

function formatHelpMessage() {
  return `📘 HƯỚNG DẪN SỬ DỤNG MONEY BUDDY
-------------------
Bạn có thể dùng 2 cách:

1) Cách hội thoại
- /thu, /chi, /rut, /nap
Bot sẽ hỏi từng bước để nhập.

2) Cách nhập 1 dòng
- /thu <số_tiền> [tm|tk] <lý_do>
  Ví dụ: /thu 100k tm lương tháng
- /chi <số_tiền> [tm|tk] <lý_do>
  Ví dụ: /chi 50k tk ăn trưa
- /rut <số_tiền> [lý_do]
  Ví dụ: /rut 500k rút ATM
- /nap <số_tiền> [lý_do]
  Ví dụ: /nap 300k nạp vào tài khoản

Lệnh khác:
- /thongke: xem thống kê tổng quát
- /huy: hủy thao tác đang nhập

Mẹo: bạn có thể bấm các nút ô vuông để thao tác nhanh, không cần gõ lệnh.`;
}

async function sendDailyReminder() {
  const subscribers = await subscribersCollection.find({}).toArray();
  if (subscribers.length === 0) {
    return;
  }

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

function startDailyReminderScheduler() {
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
        await sendDailyReminder();
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

function getCurrentHourInTimezone(timezone) {
  return Number.parseInt(
    new Date().toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    }),
    10,
  );
}

function isInSleepWindow() {
  const hour = getCurrentHourInTimezone(REMINDER_TIMEZONE);
  if (SLEEP_START_HOUR > SLEEP_END_HOUR) {
    // Qua nửa đêm, ví dụ 23:00 → 06:00
    return hour >= SLEEP_START_HOUR || hour < SLEEP_END_HOUR;
  }
  return hour >= SLEEP_START_HOUR && hour < SLEEP_END_HOUR;
}

function startKeepAlive() {
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

async function setupBotCommands() {
  await bot.setMyCommands([
    { command: 'start', description: 'Mở menu thao tác nhanh' },
    { command: 'menu', description: 'Hiển thị menu nút bấm' },
    {
      command: 'thu',
      description: 'Bắt đầu ghi khoản thu',
    },
    {
      command: 'chi',
      description: 'Bắt đầu ghi khoản chi',
    },
    { command: 'rut', description: 'Bắt đầu ghi giao dịch rút tiền' },
    {
      command: 'nap',
      description: 'Bắt đầu ghi giao dịch nạp tiền',
    },
    { command: 'thongke', description: 'Xem thống kê tổng quát' },
    { command: 'huy', description: 'Hủy thao tác đang nhập' },
    { command: 'help', description: 'Xem hướng dẫn sử dụng bot' },
  ]);
}

async function sendOverview(chatId) {
  const report = await getDetailedReportData();
  await bot.sendMessage(chatId, formatOverviewMessage(report), {
    reply_markup: getMainMenuKeyboard(),
  });
}

async function startFlowByMenu(chatId, flow) {
  const flowLabel = {
    income: 'Nhập số tiền bạn muốn ghi nhận',
    expense: 'Nhập số tiền bạn muốn ghi nhận',
    withdraw: 'Nhập số tiền bạn muốn rút (từ tài khoản sang tiền mặt)',
    deposit: 'Nhập số tiền bạn muốn nạp (từ tiền mặt sang tài khoản)',
  };

  startConversation(chatId, flow);
  await bot.sendMessage(chatId, flowLabel[flow], {
    reply_markup: getConversationKeyboard(),
  });
}

async function handleMenuAction(chatId, text) {
  if (text === BUTTON_THU) {
    await startFlowByMenu(chatId, 'income');
    return true;
  }

  if (text === BUTTON_CHI) {
    await startFlowByMenu(chatId, 'expense');
    return true;
  }

  if (text === BUTTON_RUT) {
    await startFlowByMenu(chatId, 'withdraw');
    return true;
  }

  if (text === BUTTON_NAP) {
    await startFlowByMenu(chatId, 'deposit');
    return true;
  }

  if (text === BUTTON_THONGKE) {
    await sendOverview(chatId);
    return true;
  }

  if (text === BUTTON_HELP) {
    await bot.sendMessage(chatId, formatHelpMessage(), {
      reply_markup: getMainMenuKeyboard(),
    });
    return true;
  }

  return false;
}

async function saveIncomeExpense(chatId, flow, amount, account, reason) {
  await transactionsCollection.insertOne({
    type: flow,
    amount,
    reason,
    account,
    date: new Date(),
  });

  const actionLabel = flow === 'income' ? 'thu' : 'chi';
  const emoji = flow === 'income' ? '✅' : '💸';
  await bot.sendMessage(
    chatId,
    `${emoji} Đã ghi nhận ${actionLabel} ${amount.toLocaleString()}đ (${accountLabel(account)})\nLý do: ${reason}`,
  );
}

async function saveTransfer(chatId, flow, amount, reason) {
  const direction =
    flow === 'withdraw' ? TRANSFER_BANK_TO_CASH : TRANSFER_CASH_TO_BANK;
  const defaultReason = flow === 'withdraw' ? 'Rút tiền' : 'Nạp tiền';

  await transactionsCollection.insertOne({
    type: 'transfer',
    direction,
    amount,
    reason: reason || defaultReason,
    date: new Date(),
  });

  if (flow === 'withdraw') {
    await bot.sendMessage(
      chatId,
      `🏧 Đã rút ${amount.toLocaleString()}đ từ Tài khoản sang Tiền mặt`,
    );
    return;
  }

  await bot.sendMessage(
    chatId,
    `🏦 Đã nạp ${amount.toLocaleString()}đ từ Tiền mặt vào Tài khoản`,
  );
}

bot.onText(/^\/thu(?:@\w+)?\s+(.+)$/, async (msg, match) => {
  try {
    await registerSubscriber(msg.chat.id);
    clearConversation(msg.chat.id);

    const { amount, account, reason } = parseInlineIncomeExpenseInput(match[1]);
    if (Number.isNaN(amount) || amount <= 0) {
      await bot.sendMessage(
        msg.chat.id,
        '⚠️ Số tiền không hợp lệ. Ví dụ: /thu 100k tm lương',
      );
      return;
    }

    if (!reason) {
      await bot.sendMessage(
        msg.chat.id,
        '⚠️ Vui lòng nhập lý do. Ví dụ: /thu 100k tk bán đồ cũ',
      );
      return;
    }

    await saveIncomeExpense(msg.chat.id, 'income', amount, account, reason);
  } catch (error) {
    await bot.sendMessage(msg.chat.id, '❌ Không thể lưu dữ liệu vào MongoDB.');
  }
});

bot.onText(/^\/chi(?:@\w+)?\s+(.+)$/, async (msg, match) => {
  try {
    await registerSubscriber(msg.chat.id);
    clearConversation(msg.chat.id);

    const { amount, account, reason } = parseInlineIncomeExpenseInput(match[1]);
    if (Number.isNaN(amount) || amount <= 0) {
      await bot.sendMessage(
        msg.chat.id,
        '⚠️ Số tiền không hợp lệ. Ví dụ: /chi 50k tm ăn trưa',
      );
      return;
    }

    if (!reason) {
      await bot.sendMessage(
        msg.chat.id,
        '⚠️ Vui lòng nhập lý do. Ví dụ: /chi 50k tk cafe',
      );
      return;
    }

    await saveIncomeExpense(msg.chat.id, 'expense', amount, account, reason);
  } catch (error) {
    await bot.sendMessage(msg.chat.id, '❌ Không thể lưu dữ liệu vào MongoDB.');
  }
});

bot.onText(/^\/rut(?:@\w+)?\s+(.+)$/, async (msg, match) => {
  try {
    await registerSubscriber(msg.chat.id);
    clearConversation(msg.chat.id);

    const { amount, reason } = parseInlineTransferInput(match[1]);
    if (Number.isNaN(amount) || amount <= 0) {
      await bot.sendMessage(
        msg.chat.id,
        '⚠️ Số tiền không hợp lệ. Ví dụ: /rut 500k rút ATM',
      );
      return;
    }

    await saveTransfer(msg.chat.id, 'withdraw', amount, reason);
  } catch (error) {
    await bot.sendMessage(msg.chat.id, '❌ Không thể lưu giao dịch rút tiền.');
  }
});

bot.onText(/^\/nap(?:@\w+)?\s+(.+)$/, async (msg, match) => {
  try {
    await registerSubscriber(msg.chat.id);
    clearConversation(msg.chat.id);

    const { amount, reason } = parseInlineTransferInput(match[1]);
    if (Number.isNaN(amount) || amount <= 0) {
      await bot.sendMessage(
        msg.chat.id,
        '⚠️ Số tiền không hợp lệ. Ví dụ: /nap 500k nạp vào tài khoản',
      );
      return;
    }

    await saveTransfer(msg.chat.id, 'deposit', amount, reason);
  } catch (error) {
    await bot.sendMessage(msg.chat.id, '❌ Không thể lưu giao dịch nạp tiền.');
  }
});

bot.onText(/^\/thu(?:@\w+)?$/, async (msg) => {
  await registerSubscriber(msg.chat.id);
  await startFlowByMenu(msg.chat.id, 'income');
});

bot.onText(/^\/chi(?:@\w+)?$/, async (msg) => {
  await registerSubscriber(msg.chat.id);
  await startFlowByMenu(msg.chat.id, 'expense');
});

bot.onText(/^\/rut(?:@\w+)?$/, async (msg) => {
  await registerSubscriber(msg.chat.id);
  await startFlowByMenu(msg.chat.id, 'withdraw');
});

bot.onText(/^\/nap(?:@\w+)?$/, async (msg) => {
  await registerSubscriber(msg.chat.id);
  await startFlowByMenu(msg.chat.id, 'deposit');
});

bot.onText(/^\/(start|menu)(?:@\w+)?$/, async (msg) => {
  await registerSubscriber(msg.chat.id);
  clearConversation(msg.chat.id);
  await sendMainMenu(msg.chat.id, 'Chọn thao tác bằng nút bên dưới:');
});

bot.onText(/^\/huy(?:@\w+)?$/, async (msg) => {
  clearConversation(msg.chat.id);
  await sendMainMenu(msg.chat.id, 'Đã hủy thao tác hiện tại.');
});

bot.onText(/^\/help(?:@\w+)?$/, async (msg) => {
  await registerSubscriber(msg.chat.id);
  await bot.sendMessage(msg.chat.id, formatHelpMessage(), {
    reply_markup: getMainMenuKeyboard(),
  });
});

bot.on('message', async (msg) => {
  try {
    if (!msg.text) {
      return;
    }

    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const state = conversationStates.get(chatId);

    if (text === BUTTON_HUY) {
      clearConversation(chatId);
      await sendMainMenu(chatId, 'Đã hủy thao tác hiện tại.');
      return;
    }

    if (!state) {
      await registerSubscriber(chatId);
      const handled = await handleMenuAction(chatId, text);
      if (handled) {
        return;
      }
    }

    if (!state || text.startsWith('/')) {
      return;
    }

    if (isMenuButton(text)) {
      await bot.sendMessage(
        chatId,
        'Bạn đang nhập dở một thao tác. Bấm ❌ Hủy để hủy thao tác hiện tại.',
        { reply_markup: getConversationKeyboard() },
      );
      return;
    }

    if (state.step === 'amount') {
      const amount = parseMoney(text);
      if (Number.isNaN(amount) || amount <= 0) {
        bot.sendMessage(
          chatId,
          '⚠️ Số tiền không hợp lệ, vui lòng nhập lại (ví dụ: 100k)',
          {
            reply_markup: getConversationKeyboard(),
          },
        );
        return;
      }

      state.amount = amount;

      if (state.flow === 'income' || state.flow === 'expense') {
        state.step = 'account';
        conversationStates.set(chatId, state);
        bot.sendMessage(
          chatId,
          'Tiền thuộc nguồn nào? Nhập `tm` (tiền mặt) hoặc `tk` (tài khoản)',
          {
            reply_markup: getConversationKeyboard(),
          },
        );
        return;
      }

      state.step = 'reason';
      conversationStates.set(chatId, state);
      bot.sendMessage(
        chatId,
        'Nhập lý do (có thể nhập `bo qua` nếu không có)',
        {
          reply_markup: getConversationKeyboard(),
        },
      );
      return;
    }

    if (state.step === 'account') {
      const account = parseAccountToken(text);
      if (!account) {
        bot.sendMessage(
          chatId,
          '⚠️ Nguồn tiền không hợp lệ. Vui lòng nhập `tm` hoặc `tk`.',
          {
            reply_markup: getConversationKeyboard(),
          },
        );
        return;
      }

      state.account = account;
      state.step = 'reason';
      conversationStates.set(chatId, state);
      bot.sendMessage(chatId, 'Nhập lý do thu/chi', {
        reply_markup: getConversationKeyboard(),
      });
      return;
    }

    if (state.step === 'reason') {
      const reason = text;
      if (
        (state.flow === 'income' || state.flow === 'expense') &&
        (!reason || reason.toLowerCase() === 'bo qua')
      ) {
        bot.sendMessage(chatId, '⚠️ Vui lòng nhập lý do cho khoản thu/chi.', {
          reply_markup: getConversationKeyboard(),
        });
        return;
      }

      if (state.flow === 'income' || state.flow === 'expense') {
        await saveIncomeExpense(
          chatId,
          state.flow,
          state.amount,
          state.account,
          reason,
        );
        clearConversation(chatId);
        await sendMainMenu(chatId);
        return;
      }

      const transferReason =
        !reason || reason.toLowerCase() === 'bo qua'
          ? state.flow === 'withdraw'
            ? 'Rút tiền'
            : 'Nạp tiền'
          : reason;

      if (state.flow === 'withdraw') {
        await saveTransfer(chatId, 'withdraw', state.amount, transferReason);
        clearConversation(chatId);
        await sendMainMenu(chatId);
        return;
      }

      if (state.flow === 'deposit') {
        await saveTransfer(chatId, 'deposit', state.amount, transferReason);
        clearConversation(chatId);
        await sendMainMenu(chatId);
      }
    }
  } catch (error) {
    clearConversation(msg.chat.id);
    bot.sendMessage(
      msg.chat.id,
      '❌ Có lỗi khi xử lý hội thoại. Vui lòng thử lại.',
      {
        reply_markup: getMainMenuKeyboard(),
      },
    );
  }
});

// Thống kê
bot.onText(/\/thongke/, async (msg) => {
  try {
    await registerSubscriber(msg.chat.id);
    await sendOverview(msg.chat.id);
  } catch (error) {
    bot.sendMessage(msg.chat.id, '❌ Không thể lấy thống kê từ MongoDB.');
  }
});

async function startBot() {
  startHealthServer();
  await connectMongo();
  await setupTelegramDeliveryMode();
  await setupBotCommands();
  startDailyReminderScheduler();
  startKeepAlive();
  console.log('Bot đang chạy với MongoDB...');
}

startBot().catch((error) => {
  console.error('Không thể kết nối MongoDB:', error.message);
  process.exit(1);
});
