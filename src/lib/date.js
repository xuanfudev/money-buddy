const { REMINDER_TIMEZONE } = require('../config');

function getCurrentHourInTimezone(timezone = REMINDER_TIMEZONE) {
  return Number.parseInt(
    new Date().toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    }),
    10,
  );
}

function parseReminderTime(timeText) {
  const match = /^(\d{2}):(\d{2})$/.exec(timeText);
  if (!match) return null;

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function getDateRanges(timezone = REMINDER_TIMEZONE) {
  const now = new Date();
  const vnDateStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
  const [y, m] = vnDateStr.split('-').map(Number);

  const startOfDay = new Date(`${vnDateStr}T00:00:00+07:00`);
  const endOfDay = new Date(`${vnDateStr}T23:59:59.999+07:00`);

  const baseDate = new Date(`${vnDateStr}T12:00:00+07:00`);
  const dow = baseDate.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayDate = new Date(baseDate);
  mondayDate.setUTCDate(mondayDate.getUTCDate() + mondayOffset);
  const sundayDate = new Date(mondayDate);
  sundayDate.setUTCDate(sundayDate.getUTCDate() + 6);
  const mondayStr = mondayDate.toISOString().slice(0, 10);
  const sundayStr = sundayDate.toISOString().slice(0, 10);
  const startOfWeek = new Date(`${mondayStr}T00:00:00+07:00`);
  const endOfWeek = new Date(`${sundayStr}T23:59:59.999+07:00`);

  const mm = String(m).padStart(2, '0');
  const startOfMonth = new Date(`${y}-${mm}-01T00:00:00+07:00`);
  const lastDay = new Date(Date.UTC(y, m, 0));
  const dd = String(lastDay.getUTCDate()).padStart(2, '0');
  const endOfMonth = new Date(`${y}-${mm}-${dd}T23:59:59.999+07:00`);

  const startOfYear = new Date(`${y}-01-01T00:00:00+07:00`);
  const endOfYear = new Date(`${y}-12-31T23:59:59.999+07:00`);

  return {
    day: { start: startOfDay, end: endOfDay },
    week: { start: startOfWeek, end: endOfWeek },
    month: { start: startOfMonth, end: endOfMonth },
    year: { start: startOfYear, end: endOfYear },
  };
}

module.exports = {
  getCurrentHourInTimezone,
  parseReminderTime,
  getDateRanges,
};
