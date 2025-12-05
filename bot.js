const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');

const bot = new TelegramBot(TOKEN, { polling: true });

// Улучшенное хранилище с проверкой времени
const userTimers = new Map();
const messagesToDelete = new Map(); // Для автоудаления

// ==================== АВТОУДАЛЕНИЕ СООБЩЕНИЙ ====================
// Функция безопасного удаления
async function safeDeleteMessage(chatId, messageId) {
  try {
    // Проверяем что сообщение не слишком старое (Telegram ограничение)
    await bot.deleteMessage(chatId, messageId);
    console.log(`✅ Сообщение ${messageId} удалено`);
  } catch (error) {
    // Игнорируем ошибки удаления
    console.log(`⚠️ Не удалось удалить сообщение ${messageId}:`, error.message);
  }
}

// Функция планирования удаления
function scheduleDeletion(chatId, messageId, delayMs) {
  const timer = setTimeout(() => {
    safeDeleteMessage(chatId, messageId);
    messagesToDelete.delete(`${chatId}_${messageId}`);
  }, delayMs);

  messagesToDelete.set(`${chatId}_${messageId}`, timer);
}

// ==================== ОБОРОТЫ ТУРБИНЫ (исправленный) ====================
bot.onText(/⚙️ Обороты турбины|\/turbine/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const userName = msg.from.first_name;
  const key = `${chatId}_${userId}`;

  // Останавливаем предыдущий
  if (userTimers.has(key)) {
    const { timer, messageId } = userTimers.get(key);
    clearInterval(timer);
    safeDeleteMessage(chatId, messageId);
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
  const maxUpdates = 30; // 1 минута вместо 2 (для теста)

  // Запускаем таймер
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

      // Останавливаем через 1 минуту
      if (updateCount >= maxUpdates) {
        clearInterval(timer);
        userTimers.delete(key);

        // Не редактируем, а отправляем новое сообщение
        const finalMsg = await bot.sendMessage(chatId,
          `✅ *Мониторинг завершен*\n\n` +
          `👤 ${userName}\n` +
          `🎯 Последние обороты: ${newRPM} об/мин`,
          {
            parse_mode: 'Markdown',
            reply_to_message_id: msg.message_id
          }
        );

        // Удаляем основное сообщение мониторинга
        setTimeout(() => {
          safeDeleteMessage(chatId, messageId);
        }, 1000);

        // Удаляем финальное сообщение через 30 секунд
        scheduleDeletion(chatId, finalMsg.message_id, 30000);
      }

    } catch (error) {
      clearInterval(timer);
      userTimers.delete(key);
    }
  }, 2000);

  userTimers.set(key, { timer, messageId });
});

// ==================== КОНТАКТЫ (с автоудалением) ====================
bot.onText(/👥 Контакты сотрудников|\/contacts/, async (msg) => {
  try {
    const filePath = path.join(DATA_DIR, 'contacts.json');
    const data = await fs.readFile(filePath, 'utf8');
    const contacts = JSON.parse(data);

    let message = `📞 *Контакты для ${msg.from.first_name}*\n\n`;

    contacts.slice(0, 5).forEach((contact, index) => {
      message += `*${index + 1}. ${contact.name}*\n`;
      message += `   🏢 ${contact.position}\n`;
      message += `   📱 ${contact.phone}\n`;
      if (contact.shift) message += `   🕐 ${contact.shift}\n`;
      message += `\n`;
    });

    if (contacts.length > 5) {
      message += `...и еще ${contacts.length - 5} сотрудников`;
    }

    const sentMsg = await bot.sendMessage(msg.chat.id, message, {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id
    });

    // Автоудаление через 5 минут
    scheduleDeletion(msg.chat.id, sentMsg.message_id, 5 * 60 * 1000);

  } catch (error) {
    const sentMsg = await bot.sendMessage(msg.chat.id,
      `📞 ${msg.from.first_name}, контакты загружаются...`,
      { reply_to_message_id: msg.message_id }
    );

    scheduleDeletion(msg.chat.id, sentMsg.message_id, 2 * 60 * 1000);
  }
});

// ==================== ГРАФИКИ (исправленные) ====================
bot.onText(/📅 График текущего месяца/, async (msg) => {
  const filePath = path.join(DATA_DIR, 'schedule_current.jpg');

  try {
    // Проверяем существование файла
    await fs.access(filePath);

    // Читаем файл как Buffer
    const photoBuffer = await fs.readFile(filePath);

    // Отправляем фото
    const sentMsg = await bot.sendPhoto(msg.chat.id, photoBuffer, {
      caption: `📅 График для ${msg.from.first_name}`,
      reply_to_message_id: msg.message_id
    });

    // Автоудаление через 10 минут
    if (sentMsg.photo) {
      scheduleDeletion(msg.chat.id, sentMsg.message_id, 10 * 60 * 1000);
    }

  } catch (error) {
    console.error('Ошибка загрузки графика:', error);
    const sentMsg = await bot.sendMessage(msg.chat.id,
      `📅 ${msg.from.first_name}, график загружается...`,
      { reply_to_message_id: msg.message_id }
    );

    scheduleDeletion(msg.chat.id, sentMsg.message_id, 2 * 60 * 1000);
  }
});

// ==================== ОЧИСТКА ПРИ ВЫХОДЕ ====================
process.on('SIGINT', () => {
  console.log('\n🛑 Останавливаю бота...');

  // Останавливаем все таймеры
  userTimers.forEach(({ timer }) => clearInterval(timer));
  messagesToDelete.forEach(timer => clearTimeout(timer));

  userTimers.clear();
  messagesToDelete.clear();

  console.log('✅ Все таймеры остановлены');
  process.exit(0);
});

// ==================== ПРОВЕРКА ФАЙЛОВ ====================
// Проверяем доступность файлов при запуске
async function checkFiles() {
  console.log('🔍 Проверяю файлы...');

  const files = [
    { name: 'contacts.json', path: path.join(DATA_DIR, 'contacts.json') },
    { name: 'schedule_current.jpg', path: path.join(DATA_DIR, 'schedule_current.jpg') },
    { name: 'schedule_cycle.jpg', path: path.join(DATA_DIR, 'schedule_cycle.jpg') }
  ];

  for (const file of files) {
    try {
      await fs.access(file.path);
      console.log(`✅ ${file.name} доступен`);
    } catch {
      console.log(`⚠️ ${file.name} не найден`);
    }
  }
}

// Запускаем проверку
checkFiles().then(() => {
  console.log('✅ Бот готов к работе на Railway!');
});