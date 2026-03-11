const { TRANSFER_BANK_TO_CASH, TRANSFER_CASH_TO_BANK } = require('../config');
const { getTransactionsCollection } = require('../db');
const { parseInlineTransferInput } = require('../lib/parse');

async function saveTransfer(bot, chatId, flow, amount, reason) {
  const transactionsCollection = getTransactionsCollection();
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

function registerHandlers(bot, deps) {
  const { registerSubscriber, clearConversation, startFlowByMenu } = deps;

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
      await saveTransfer(bot, msg.chat.id, 'withdraw', amount, reason);
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
      await saveTransfer(bot, msg.chat.id, 'deposit', amount, reason);
    } catch (error) {
      await bot.sendMessage(msg.chat.id, '❌ Không thể lưu giao dịch nạp tiền.');
    }
  });

  bot.onText(/^\/rut(?:@\w+)?$/, async (msg) => {
    await registerSubscriber(msg.chat.id);
    startFlowByMenu(msg.chat.id, 'withdraw');
  });

  bot.onText(/^\/nap(?:@\w+)?$/, async (msg) => {
    await registerSubscriber(msg.chat.id);
    startFlowByMenu(msg.chat.id, 'deposit');
  });
}

module.exports = {
  saveTransfer,
  registerHandlers,
};
