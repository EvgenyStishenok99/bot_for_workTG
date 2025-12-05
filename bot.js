const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');

// ==================== КОНФИГУРАЦИЯ ИЗ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ====================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;

// Проверка обязательных переменных
if (!TOKEN) {
  console.error('❌ ОШИБКА: TELEGRAM_BOT_TOKEN не установлен!');
  console.error('📝 Установите в Railway Variables:');
  console.error('TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather');
  process.exit(1);
}

console.log('🚀 Бот запускается на Railway...');
console.log('✅ Токен получен из переменных окружения');
console.log(`📱 ID группы: ${GROUP_CHAT_ID || 'не указан'}`);

const bot = new TelegramBot(TOKEN, { polling: true });

// Уведомление о запуске (если указан GROUP_CHAT_ID)
if (GROUP_CHAT_ID) {
  bot.getMe().then(me => {
    bot.sendMessage(GROUP_CHAT_ID,
      `🤖 *БОТ ЗАПУЩЕН НА СЕРВЕРЕ*\n\n` +
      `✅ Система мониторинга работает 24/7\n` +
      `📅 ${new Date().toLocaleString()}\n` +
      `🔧 Режим: Railway (автономный)`,
      { parse_mode: 'Markdown' }
    ).catch(err => console.log('⚠️ Не удалось отправить уведомление в группу'));
  });
}

// Хранилище таймеров
const userTimers = new Map();

// ==================== ГЛАВНОЕ МЕНЮ ====================
bot.onText(/\/menu|\/start/, async (msg) => {
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['📅 График текущего месяца'],
        ['🔄 График на цикл'],
        ['👥 Контакты сотрудников'],
        ['⚙️ Обороты турбины']
      ],
      resize_keyboard: true
    }
  };

  await bot.sendMessage(msg.chat.id,
    `👋 ${msg.from.first_name}, выберите функцию:`,
    {
      ...keyboard,
      reply_to_message_id: msg.message_id
    }
  );
});

// ==================== КОНТАКТЫ СОТРУДНИКОВ ====================
bot.onText(/👥 Контакты сотрудников|\/contacts/, async (msg) => {
  try {
    const data = await fs.readFile(path.join(__dirname, 'data', 'contacts.json'), 'utf8');
    const contacts = JSON.parse(data);

    let message = `📞 *Контакты для ${msg.from.first_name}*\n\n`;

    contacts.forEach((contact, index) => {
      message += `*${index + 1}. ${contact.name}*\n`;
      message += `   🏢 ${contact.position}\n`;
      message += `   📱 ${contact.phone}\n`;
      if (contact.shift) message += `   🕐 ${contact.shift}\n`;
      if (contact.email) message += `   📧 ${contact.email}\n`;
      message += `\n`;
    });

    await bot.sendMessage(msg.chat.id, message, {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id
    });

  } catch (error) {
    await bot.sendMessage(msg.chat.id,
      `📞 ${msg.from.first_name}, контакты загружаются...`,
      { reply_to_message_id: msg.message_id }
    );
  }
});

// ==================== ОБОРОТЫ ТУРБИНЫ ====================
bot.onText(/⚙️ Обороты турбины|\/turbine/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const userName = msg.from.first_name;
  const key = `${chatId}_${userId}`;

  if (userTimers.has(key)) {
    const { timer, messageId } = userTimers.get(key);
    clearInterval(timer);
    bot.deleteMessage(chatId, messageId).catch(() => {});
    userTimers.delete(key);
  }

  const generateRPM = () => Math.floor(Math.random() * (6960 - 6896 + 1)) + 6896;

  const createProgressBar = (rpm) => {
    const progress = Math.round(((rpm - 6896) / (6960 - 6896)) * 100);
    const filled = Math.round(progress / 10);
    const empty = 10 - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
  };

  const initialRPM = generateRPM();
  const sentMsg = await bot.sendMessage(chatId,
    `⚙️ *Мониторинг для ${userName}*\n\n` +
    `🎯 Текущие обороты: *${initialRPM} об/мин*\n\n` +
    `📊 [${createProgressBar(initialRPM)}] ${Math.round(((initialRPM - 6896) / (6960 - 6896)) * 100)}%`,
    {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id
    }
  );

  const messageId = sentMsg.message_id;
  let updateCount = 0;
  const maxUpdates = 60;

  const timer = setInterval(async () => {
    updateCount++;
    const newRPM = generateRPM();

    try {
      await bot.editMessageText(
        `⚙️ *Мониторинг для ${userName}*\n\n` +
        `🎯 Текущие обороты: *${newRPM} об/мин*\n\n` +
        `📊 [${createProgressBar(newRPM)}] ${Math.round(((newRPM - 6896) / (6960 - 6896)) * 100)}%`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );

      if (updateCount >= maxUpdates) {
        clearInterval(timer);
        userTimers.delete(key);

        await bot.editMessageText(
          `✅ *Мониторинг завершен*\n\n` +
          `👤 ${userName}\n` +
          `🎯 Последние обороты: ${newRPM} об/мин`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
          }
        );

        setTimeout(() => {
          bot.deleteMessage(chatId, messageId).catch(() => {});
        }, 30000);
      }

    } catch (error) {
      clearInterval(timer);
      userTimers.delete(key);
    }
  }, 2000);

  userTimers.set(key, { timer, messageId });
});

// ==================== ГРАФИКИ ====================
bot.onText(/📅 График текущего месяца/, async (msg) => {
  const filePath = path.join(__dirname, 'data', 'schedule_current.jpg');
  try {
    await fs.access(filePath);
    await bot.sendPhoto(msg.chat.id, filePath, {
      caption: `📅 График для ${msg.from.first_name}`,
      reply_to_message_id: msg.message_id
    });
  } catch {
    await bot.sendMessage(msg.chat.id,
      `📅 ${msg.from.first_name}, график загружается...`,
      { reply_to_message_id: msg.message_id }
    );
  }
});

bot.onText(/🔄 График на цикл/, async (msg) => {
  const filePath = path.join(__dirname, 'data', 'schedule_cycle.jpg');
  try {
    await fs.access(filePath);
    await bot.sendPhoto(msg.chat.id, filePath, {
      caption: `🔄 График для ${msg.from.first_name}`,
      reply_to_message_id: msg.message_id
    });
  } catch {
    await bot.sendMessage(msg.chat.id,
      `🔄 ${msg.from.first_name}, график загружается...`,
      { reply_to_message_id: msg.message_id }
    );
  }
});

// ==================== ЗАВЕРШЕНИЕ ====================
process.on('SIGINT', () => {
  console.log('\n🛑 Останавливаю бота...');
  userTimers.forEach(({ timer }) => clearInterval(timer));
  userTimers.clear();
  process.exit(0);
});

console.log('✅ Бот запущен и готов к работе на Railway!');