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
- /thongke: xem thống kê tổng quát (số giao dịch, thu/chi theo ngày/tuần/tháng/năm, tổng dư, top thu/chi)
- /huy: hủy thao tác đang nhập
- /reset xacnhan: xóa toàn bộ dữ liệu giao dịch

Mẹo: bạn có thể bấm các nút ô vuông để thao tác nhanh, không cần gõ lệnh.`;
}

function registerHandlers(bot, deps) {
  const { registerSubscriber, getMainMenuKeyboard } = deps;

  bot.onText(/^\/help(?:@\w+)?$/, async (msg) => {
    await registerSubscriber(msg.chat.id);
    await bot.sendMessage(msg.chat.id, formatHelpMessage(), {
      reply_markup: getMainMenuKeyboard(),
    });
  });
}

module.exports = {
  formatHelpMessage,
  registerHandlers,
};
