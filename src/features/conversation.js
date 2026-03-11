const {
  BUTTON_THU,
  BUTTON_CHI,
  BUTTON_RUT,
  BUTTON_NAP,
  BUTTON_THONGKE,
  BUTTON_HELP,
  BUTTON_HUY,
} = require('../config');
const { getSubscribersCollection } = require('../db');
const { parseMoney, parseAccountToken } = require('../lib/parse');
const {
  getMainMenuKeyboard,
  getConversationKeyboard,
  isMenuButton,
} = require('../lib/keyboard');
const { saveIncomeExpense } = require('./incomeExpense');
const { saveTransfer } = require('./transfer');
const { formatHelpMessage } = require('./help');
const { sendOverview } = require('./statistics');

const conversationStates = new Map();

function startConversation(chatId, flow) {
  conversationStates.set(chatId, { flow, step: 'amount' });
}

function clearConversation(chatId) {
  conversationStates.delete(chatId);
}

async function registerSubscriber(chatId) {
  const subscribersCollection = getSubscribersCollection();
  await subscribersCollection.updateOne(
    { chatId },
    {
      $set: { chatId, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}

async function sendMainMenu(bot, chatId, text = 'Chọn thao tác bên dưới:') {
  await bot.sendMessage(chatId, text, {
    reply_markup: getMainMenuKeyboard(),
  });
}

async function startFlowByMenu(bot, chatId, flow) {
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

async function handleMenuAction(bot, chatId, text) {
  if (text === BUTTON_THU) {
    await startFlowByMenu(bot, chatId, 'income');
    return true;
  }
  if (text === BUTTON_CHI) {
    await startFlowByMenu(bot, chatId, 'expense');
    return true;
  }
  if (text === BUTTON_RUT) {
    await startFlowByMenu(bot, chatId, 'withdraw');
    return true;
  }
  if (text === BUTTON_NAP) {
    await startFlowByMenu(bot, chatId, 'deposit');
    return true;
  }
  if (text === BUTTON_THONGKE) {
    await sendOverview(bot, chatId, { sendMainMenu: (cid) => sendMainMenu(bot, cid) });
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

function registerHandlers(bot) {
  const deps = {
    registerSubscriber,
    clearConversation,
    getMainMenuKeyboard,
    sendMainMenu: (cid) => sendMainMenu(bot, cid),
    startFlowByMenu: (cid, flow) => startFlowByMenu(bot, cid, flow),
  };

  bot.onText(/^\/(start|menu)(?:@\w+)?$/, async (msg) => {
    await registerSubscriber(msg.chat.id);
    clearConversation(msg.chat.id);
    await sendMainMenu(bot, msg.chat.id, 'Chọn thao tác bằng nút bên dưới:');
  });

  bot.onText(/^\/huy(?:@\w+)?$/, async (msg) => {
    clearConversation(msg.chat.id);
    await sendMainMenu(bot, msg.chat.id, 'Đã hủy thao tác hiện tại.');
  });

  bot.onText(/^\/reset(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
    try {
      const { getTransactionsCollection } = require('../db');
      const transactionsCollection = getTransactionsCollection();

      await registerSubscriber(msg.chat.id);
      clearConversation(msg.chat.id);

      const confirmation = (match?.[1] || '').trim().toLowerCase();
      if (confirmation !== 'xacnhan') {
        await bot.sendMessage(
          msg.chat.id,
          '⚠️ Lệnh này sẽ xóa toàn bộ dữ liệu giao dịch. Để xác nhận, nhập: /reset xacnhan',
          { reply_markup: getMainMenuKeyboard() },
        );
        return;
      }

      const result = await transactionsCollection.deleteMany({});
      await bot.sendMessage(
        msg.chat.id,
        `🧹 Đã reset dữ liệu thành công. Đã xóa ${result.deletedCount} giao dịch.`,
        { reply_markup: getMainMenuKeyboard() },
      );
    } catch (error) {
      await bot.sendMessage(msg.chat.id, '❌ Không thể reset dữ liệu lúc này.');
    }
  });

  bot.on('message', async (msg) => {
    try {
      if (!msg.text) return;

      const chatId = msg.chat.id;
      const text = msg.text.trim();
      const state = conversationStates.get(chatId);

      if (text === BUTTON_HUY) {
        clearConversation(chatId);
        await sendMainMenu(bot, chatId, 'Đã hủy thao tác hiện tại.');
        return;
      }

      if (!state) {
        await registerSubscriber(chatId);
        const handled = await handleMenuAction(bot, chatId, text);
        if (handled) return;
      }

      if (!state || text.startsWith('/')) return;

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
          await bot.sendMessage(
            chatId,
            '⚠️ Số tiền không hợp lệ, vui lòng nhập lại (ví dụ: 100k)',
            { reply_markup: getConversationKeyboard() },
          );
          return;
        }

        state.amount = amount;

        if (state.flow === 'income' || state.flow === 'expense') {
          state.step = 'account';
          conversationStates.set(chatId, state);
          await bot.sendMessage(
            chatId,
            'Tiền thuộc nguồn nào? Nhập `tm` (tiền mặt) hoặc `tk` (tài khoản)',
            { reply_markup: getConversationKeyboard() },
          );
          return;
        }

        state.step = 'reason';
        conversationStates.set(chatId, state);
        await bot.sendMessage(
          chatId,
          'Nhập lý do (có thể nhập `bo qua` nếu không có)',
          { reply_markup: getConversationKeyboard() },
        );
        return;
      }

      if (state.step === 'account') {
        const account = parseAccountToken(text);
        if (!account) {
          await bot.sendMessage(
            chatId,
            '⚠️ Nguồn tiền không hợp lệ. Vui lòng nhập `tm` hoặc `tk`.',
            { reply_markup: getConversationKeyboard() },
          );
          return;
        }

        state.account = account;
        state.step = 'reason';
        conversationStates.set(chatId, state);
        await bot.sendMessage(chatId, 'Nhập lý do thu/chi', {
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
          await bot.sendMessage(chatId, '⚠️ Vui lòng nhập lý do cho khoản thu/chi.', {
            reply_markup: getConversationKeyboard(),
          });
          return;
        }

        if (state.flow === 'income' || state.flow === 'expense') {
          await saveIncomeExpense(
            bot,
            chatId,
            state.flow,
            state.amount,
            state.account,
            reason,
          );
          clearConversation(chatId);
          await sendMainMenu(bot, chatId);
          return;
        }

        const transferReason =
          !reason || reason.toLowerCase() === 'bo qua'
            ? state.flow === 'withdraw'
              ? 'Rút tiền'
              : 'Nạp tiền'
            : reason;

        if (state.flow === 'withdraw') {
          await saveTransfer(bot, chatId, 'withdraw', state.amount, transferReason);
          clearConversation(chatId);
          await sendMainMenu(bot, chatId);
          return;
        }

        if (state.flow === 'deposit') {
          await saveTransfer(bot, chatId, 'deposit', state.amount, transferReason);
          clearConversation(chatId);
          await sendMainMenu(bot, chatId);
        }
      }
    } catch (error) {
      clearConversation(msg.chat.id);
      await bot.sendMessage(msg.chat.id, '❌ Có lỗi khi xử lý hội thoại. Vui lòng thử lại.', {
        reply_markup: getMainMenuKeyboard(),
      });
    }
  });
}

module.exports = {
  conversationStates,
  startConversation,
  clearConversation,
  registerSubscriber,
  sendMainMenu,
  startFlowByMenu,
  handleMenuAction,
  registerHandlers,
};
