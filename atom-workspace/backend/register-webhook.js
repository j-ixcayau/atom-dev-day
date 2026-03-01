const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_TOKEN;
const url = process.argv[2];

if (!url) {
  console.error('Please provide the webhook URL as an argument.');
  console.error('Usage: node register-webhook.js <WEBHOOK_URL>');
  process.exit(1);
}

const bot = new TelegramBot(token);

console.log(`Setting Telegram Webhook to: ${url}`);

bot.setWebHook(url)
  .then(() => {
    console.log('Successfully set Telegram Webhook!');
    // Verify it
    return bot.getWebHookInfo();
  })
  .then((info) => {
    console.log('Webhook Info:', info);
  })
  .catch((error) => {
    console.error('Error setting webhook:', error);
  });
