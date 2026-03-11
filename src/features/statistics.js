const {
  ACCOUNT_CASH,
  ACCOUNT_BANK,
  TRANSFER_BANK_TO_CASH,
  TRANSFER_CASH_TO_BANK,
  PERIOD_LABELS,
} = require('../config');
const { getTransactionsCollection } = require('../db');
const { getDateRanges } = require('../lib/date');
const { getStatsInlineKeyboard } = require('../lib/keyboard');
const { accountLabel } = require('./incomeExpense');

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

async function getDetailedReportData() {
  const transactionsCollection = getTransactionsCollection();
  const [result] = await transactionsCollection
    .aggregate([
      {
        $facet: {
          totals: [
            { $group: { _id: '$type', total: { $sum: '$amount' } } },
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

async function getPeriodStatsData(period) {
  const transactionsCollection = getTransactionsCollection();
  const ranges = getDateRanges();
  const range = ranges[period];
  if (!range) return null;

  const [result] = await transactionsCollection
    .aggregate([
      {
        $match: {
          date: { $gte: range.start, $lte: range.end },
        },
      },
      {
        $facet: {
          totals: [
            { $match: { $or: [{ type: 'income' }, { type: 'expense' }] } },
            { $group: { _id: '$type', total: { $sum: '$amount' } } },
          ],
          count: [{ $count: 'count' }],
          topIncome: [
            { $match: { type: 'income' } },
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
          topExpense: [
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
        },
      },
    ])
    .toArray();

  if (!result) return null;
  const totals = result.totals || [];
  const income = totals.find((t) => t._id === 'income')?.total || 0;
  const expense = totals.find((t) => t._id === 'expense')?.total || 0;
  const transactionCount = result.count?.[0]?.count || 0;

  return {
    transactionCount,
    income,
    expense,
    topIncome: result.topIncome || [],
    topExpense: result.topExpense || [],
  };
}

async function getFullStatsData() {
  const [report, dayStats, weekStats, monthStats, yearStats] = await Promise.all([
    getDetailedReportData(),
    getPeriodStatsData('day'),
    getPeriodStatsData('week'),
    getPeriodStatsData('month'),
    getPeriodStatsData('year'),
  ]);

  return {
    total: report,
    day: dayStats,
    week: weekStats,
    month: monthStats,
    year: yearStats,
  };
}

function formatOverviewMessage(data, periodLabel = '') {
  const title = periodLabel
    ? `📈 THỐNG KÊ ${periodLabel.toUpperCase()}`
    : '📈 THỐNG KÊ TỔNG QUÁT';
  return `${title}
-------------------
Tổng giao dịch: ${data.transactionCount}
Tổng thu: ${data.income.toLocaleString()}đ
Tổng chi: ${data.expense.toLocaleString()}đ
Số dư tiền mặt: ${data.cashBalance.toLocaleString()}đ
Số dư tiền tài khoản: ${data.bankBalance.toLocaleString()}đ
Tổng số dư: ${data.totalBalance.toLocaleString()}đ`;
}

function formatPeriodStatsMessage(data, periodLabel) {
  const topIncomeLines =
    (data.topIncome || []).length === 0
      ? ['- Chưa có khoản thu nào']
      : (data.topIncome || []).map(
          (item, i) =>
            `${i + 1}. ${item.amount.toLocaleString()}đ - ${item.reason || 'Không có lý do'} (${accountLabel(item.account)})`,
        );
  const topExpenseLines =
    (data.topExpense || []).length === 0
      ? ['- Chưa có khoản chi nào']
      : (data.topExpense || []).map(
          (item, i) =>
            `${i + 1}. ${item.amount.toLocaleString()}đ - ${item.reason || 'Không có lý do'} (${accountLabel(item.account)})`,
        );
  return `📊 THỐNG KÊ ${periodLabel.toUpperCase()}
-------------------
Số giao dịch: ${data.transactionCount}
Tổng thu: ${data.income.toLocaleString()}đ
Tổng chi: ${data.expense.toLocaleString()}đ

Top 3 thu:
${topIncomeLines.join('\n')}

Top 3 chi:
${topExpenseLines.join('\n')}`;
}

function formatSummaryMessage(data, title = '📊 THỐNG KÊ') {
  const topExpenseLines =
    (data.topExpenses || []).length === 0
      ? ['- Chưa có khoản chi nào']
      : (data.topExpenses || []).map(
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

function formatStatsPeriodSummary(fullStats) {
  const f = (v) => (v || 0).toLocaleString();
  const line = (label, d) =>
    d
      ? `${label}: ${d.transactionCount} gd | Thu ${f(d.income)}đ | Chi ${f(d.expense)}đ`
      : `${label}: -`;
  return `Theo kỳ:
• ${line('Hôm nay', fullStats.day)}
• ${line('Tuần', fullStats.week)}
• ${line('Tháng', fullStats.month)}
• ${line('Năm', fullStats.year)}

Bấm nút bên dưới để xem chi tiết từng kỳ.`;
}

async function sendOverview(bot, chatId, deps) {
  const fullStats = await getFullStatsData();
  const report = fullStats.total;
  const msg = formatOverviewMessage(report) + '\n\n' + formatStatsPeriodSummary(fullStats);
  await bot.sendMessage(chatId, msg, {
    reply_markup: getStatsInlineKeyboard(),
  });
  await deps.sendMainMenu(chatId);
}

function registerHandlers(bot, deps) {
  const { registerSubscriber, sendMainMenu } = deps;

  bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;
    const data = query.data;
    if (!chatId || !data?.startsWith('stats_')) return;

    try {
      await bot.answerCallbackQuery(query.id);
      const period = data.replace('stats_', '');
      const label = PERIOD_LABELS[period];

      if (period === 'total') {
        const fullStats = await getFullStatsData();
        const report = fullStats.total;
        const msg =
          formatOverviewMessage(report) + '\n\n' + formatStatsPeriodSummary(fullStats);
        await bot.editMessageText(msg, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: getStatsInlineKeyboard(),
        });
        return;
      }

      if (!label) return;
      const periodStats = await getPeriodStatsData(period);
      const msg = formatPeriodStatsMessage(periodStats || {}, label);
      await bot.editMessageText(msg, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: getStatsInlineKeyboard(),
      });
    } catch (error) {
      console.error('Callback stats lỗi:', error.message);
      await bot.answerCallbackQuery(query.id, { text: '❌ Lỗi tải thống kê' });
    }
  });

  bot.onText(/\/thongke/, async (msg) => {
    try {
      await registerSubscriber(msg.chat.id);
      await sendOverview(bot, msg.chat.id, deps);
    } catch (error) {
      bot.sendMessage(msg.chat.id, '❌ Không thể lấy thống kê từ MongoDB.');
    }
  });
}

module.exports = {
  getDetailedReportData,
  getPeriodStatsData,
  getFullStatsData,
  formatOverviewMessage,
  formatPeriodStatsMessage,
  formatSummaryMessage,
  sendOverview,
  registerHandlers,
};
