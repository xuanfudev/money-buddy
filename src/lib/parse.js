const { ACCOUNT_CASH, ACCOUNT_BANK } = require('../config');

function parseMoney(text) {
  text = String(text || '').toLowerCase();
  if (text.includes('k')) return Number.parseInt(text, 10) * 1000;
  if (text.includes('tr')) return Number.parseInt(text, 10) * 1000000;
  return Number.parseInt(text, 10);
}

function parseAccountToken(text) {
  const tokenText = String(text || '').trim().toLowerCase();
  if (['tm', 'tienmat', 'cash', 'tiền mặt'].includes(tokenText)) {
    return ACCOUNT_CASH;
  }
  if (['tk', 'taikhoan', 'bank', 'tài khoản'].includes(tokenText)) {
    return ACCOUNT_BANK;
  }
  return null;
}

function parseInlineIncomeExpenseInput(input) {
  const [amountText, ...parts] = String(input || '').trim().split(/\s+/);
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
  const [amountText, ...parts] = String(input || '').trim().split(/\s+/);
  const amount = parseMoney(amountText || '');
  const reason = parts.join(' ').trim();
  return { amount, reason };
}

module.exports = {
  parseMoney,
  parseAccountToken,
  parseInlineIncomeExpenseInput,
  parseInlineTransferInput,
};
