const http = require('http');
const https = require('https');
const {
  PORT,
  WEBHOOK_PATH,
  IS_WEBHOOK_MODE,
  RENDER_EXTERNAL_URL,
} = require('./config');

function normalizePath(rawPath) {
  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
}

function createHealthServer(bot) {
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

async function setupTelegramDeliveryMode(bot) {
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

module.exports = {
  createHealthServer,
  setupTelegramDeliveryMode,
};
