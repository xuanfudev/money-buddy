const {
  BUTTON_THU,
  BUTTON_CHI,
  BUTTON_RUT,
  BUTTON_NAP,
  BUTTON_THONGKE,
  BUTTON_HELP,
  BUTTON_HUY,
} = require('../config');

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

function getStatsInlineKeyboard() {
  const buttons = [
    [
      { text: '📅 Hôm nay', callback_data: 'stats_day' },
      { text: '📆 Tuần', callback_data: 'stats_week' },
    ],
    [
      { text: '📋 Tháng', callback_data: 'stats_month' },
      { text: '📆 Năm', callback_data: 'stats_year' },
    ],
    [{ text: '📊 Tổng quan', callback_data: 'stats_total' }],
  ];
  return { inline_keyboard: buttons };
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

module.exports = {
  getMainMenuKeyboard,
  getConversationKeyboard,
  getStatsInlineKeyboard,
  isMenuButton,
};
