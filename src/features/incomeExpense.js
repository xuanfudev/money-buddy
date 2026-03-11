const { ACCOUNT_BANK } = require('../config');
const { getTransactionsCollection } = require('../db');
const { parseInlineIncomeExpenseInput } = require('../lib/parse');
const { getDateRanges } = require('../lib/date');

function accountLabel(account) {
  return account === ACCOUNT_BANK ? 'Tài khoản' : 'Tiền mặt';
}

async function getTodayIncomeExpense() {
  const transactionsCollection = getTransactionsCollection();
  const { day } = getDateRanges();
  const rows = await transactionsCollection
    .aggregate([
      {
        $match: {
          date: { $gte: day.start, $lte: day.end },
          type: { $in: ['income', 'expense'] },
        },
      },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ])
    .toArray();
  const income = rows.find((r) => r._id === 'income')?.total || 0;
  const expense = rows.find((r) => r._id === 'expense')?.total || 0;
  return { income, expense };
}

async function saveIncomeExpense(bot, chatId, flow, amount, account, reason) {
  const transactionsCollection = getTransactionsCollection();
  await transactionsCollection.insertOne({
    type: flow,
    amount,
    reason,
    account,
    date: new Date(),
  });

  const todayTotals = await getTodayIncomeExpense();
  const actionLabel = flow === 'income' ? 'thu' : 'chi';
  const emoji = flow === 'income' ? '✅' : '💸';
  let message = `${emoji} Đã ghi nhận ${actionLabel} ${amount.toLocaleString()}đ (${accountLabel(account)})\nLý do: ${reason}`;
  message += `\n\n📅 Hôm nay: Thu ${todayTotals.income.toLocaleString()}đ | Chi ${todayTotals.expense.toLocaleString()}đ`;
  await bot.sendMessage(chatId, message);
}

function registerHandlers(bot, deps) {
  const {
    registerSubscriber,
    clearConversation,
    getMainMenuKeyboard,
    saveIncomeExpense: save,
  } = deps;

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
      await save(bot, msg.chat.id, 'income', amount, account, reason);
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
      await save(bot, msg.chat.id, 'expense', amount, account, reason);
    } catch (error) {
      await bot.sendMessage(msg.chat.id, '❌ Không thể lưu dữ liệu vào MongoDB.');
    }
  });

  bot.onText(/^\/thu(?:@\w+)?$/, async (msg) => {
    await registerSubscriber(msg.chat.id);
    deps.startFlowByMenu(msg.chat.id, 'income');
  });

  bot.onText(/^\/chi(?:@\w+)?$/, async (msg) => {
    await registerSubscriber(msg.chat.id);
    deps.startFlowByMenu(msg.chat.id, 'expense');
  });
}

module.exports = {
  accountLabel,
  getTodayIncomeExpense,
  saveIncomeExpense,
  registerHandlers,
};
