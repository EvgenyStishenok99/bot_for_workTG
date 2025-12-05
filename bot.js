const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');

// ==================== КОНФИГУРАЦИЯ ====================
// НИКОГДА не храните токен в коде! Используйте переменные окружения
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID || '401369992';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// Проверка токена
if (!TOKEN) {
  console.error('❌ ОШИБКА: TELEGRAM_BOT_TOKEN не установлен!');
  console.error('ℹ️ Установите переменную окружения TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

console.log('🚀 Бот запущен');
console.log('👑 Админ ID:', ADMIN_ID);
console.log('📁 Папка данных:', DATA_DIR);

// Главная клавиатура
const MAIN_KEYBOARD = {
  keyboard: [
    ['📅 График текущего месяца'],
    ['🔄 График на цикл'],
    ['👥 Контакты сотрудников'],
    ['⚙️ Обороты турбины']
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

const bot = new TelegramBot(TOKEN, {
  polling: true,
  // Добавляем обработку ошибок
  request: {
    timeout: 10000,
    agentOptions: {
      keepAlive: true
    }
  }
});

// ==================== ХРАНИЛИЩА ====================
const userTimers = new Map();

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function safeDeleteMessage(chatId, messageId) {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch (error) {
    if (!error.message.includes('message to delete not found')) {
      console.log(`⚠️ Не удалось удалить сообщение ${messageId}:`, error.message);
    }
  }
}

async function sendMessageWithPersistentKeyboard(chatId, text, options = {}) {
  const messageOptions = {
    ...options,
    reply_markup: MAIN_KEYBOARD
  };

  // Убираем разметку, если нет parse_mode
  if (!options.parse_mode && text.includes('*')) {
    messageOptions.parse_mode = 'Markdown';
  }

  return bot.sendMessage(chatId, text, messageOptions);
}

// ==================== ПРИВЕТСТВИЕ ====================
bot.onText(/\/start/, async (msg) => {
  await sendMessageWithPersistentKeyboard(msg.chat.id,
    `👋 Привет, ${msg.from.first_name}!\n\n` +
    `🎛️ *СИСТЕМА МОНИТОРИНГА ТУРБИН*\n\n` +
    `Используйте кнопки ниже для навигации:`,
    { parse_mode: 'Markdown' }
  );
});

// ==================== ЗАГРУЗКА КАРТИНОК АДМИНИСТРАТОРОМ ====================
bot.on('photo', async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    console.log(`⛔ Попытка загрузки от не-админа: ${msg.from.id}`);
    return;
  }

  const caption = msg.caption?.toLowerCase() || '';
  const fileId = msg.photo[msg.photo.length - 1].file_id;

  let fileName, description;

  if (caption.includes('текущий') || caption.includes('current')) {
    fileName = 'schedule_current.jpg';
    description = 'График текущего месяца';
  } else if (caption.includes('цикл') || caption.includes('cycle')) {
    fileName = 'schedule_cycle.jpg';
    description = 'График на цикл';
  } else {
    const askMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `📝 Укажите в подписи к фото:\n` +
      `• "текущий" - для графика текущего месяца\n` +
      `• "цикл" - для графика на цикл\n\n` +
      `Отправьте фото еще раз с нужной подписью.`
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, askMsg.message_id);
    }, 10000);
    return;
  }

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

    // Используем axios вместо fetch (более стабильно)
    const axios = require('axios');
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    const filePath = path.join(DATA_DIR, fileName);
    await fs.writeFile(filePath, buffer);

    console.log(`✅ ${description} загружен, размер: ${buffer.length} байт`);

    const confirmMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `✅ *${description} успешно загружен!*\n` +
      `Размер: ${(buffer.length / 1024).toFixed(2)} KB`,
      { parse_mode: 'Markdown' }
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, confirmMsg.message_id);
    }, 5000);

  } catch (error) {
    console.error('❌ Ошибка загрузки файла:', error);

    const errorMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `❌ Ошибка загрузки файла: ${error.message}`
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 5000);
  }
});

// ==================== КОНТАКТЫ СОТРУДНИКОВ ====================
bot.onText(/👥 Контакты сотрудников/, async (msg) => {
  try {
    const filePath = path.join(DATA_DIR, 'contacts.json');
    const data = await fs.readFile(filePath, 'utf8');
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

    const contactsMsg = await sendMessageWithPersistentKeyboard(msg.chat.id, message, {
      parse_mode: 'Markdown'
    });

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, contactsMsg.message_id);
    }, 30000);

  } catch (error) {
    console.error('Ошибка загрузки контактов:', error);

    // Создаем файл с контактами по умолчанию
    if (error.code === 'ENOENT') {
      const defaultContacts = [
        {
          "name": "Иванов Иван Иванович",
          "position": "Старший инженер",
          "phone": "+7 (999) 123-45-67",
          "shift": "Дневная смена",
          "email": "ivanov@company.com"
        },
        {
          "name": "Петров Петр Петрович",
          "position": "Оператор турбины",
          "phone": "+7 (999) 987-65-43",
          "shift": "Ночная смена",
          "email": "petrov@company.com"
        }
      ];

      try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(path.join(DATA_DIR, 'contacts.json'), JSON.stringify(defaultContacts, null, 2));

        // Показываем контакты снова
        bot.onText(/👥 Контакты сотрудников/, async (msg) => {
          // ... повторный вызов ...
        });
      } catch (writeError) {
        console.error('Ошибка создания файла контактов:', writeError);
      }
    }

    const errorMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `📞 ${msg.from.first_name}, контакты загружаются...`
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 10000);
  }
});

// ==================== ГРАФИКИ ====================
bot.onText(/📅 График текущего месяца/, async (msg) => {
  const filePath = path.join(DATA_DIR, 'schedule_current.jpg');

  try {
    await fs.access(filePath);
    const photoBuffer = await fs.readFile(filePath);

    const photoMsg = await bot.sendPhoto(msg.chat.id, photoBuffer, {
      caption: `📅 График для ${msg.from.first_name}`,
      reply_markup: MAIN_KEYBOARD
    });

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, photoMsg.message_id);
    }, 30000);

  } catch (error) {
    console.error('График не найден:', error);
    const errorMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `📅 ${msg.from.first_name}, график еще не загружен\n\n` +
      `*Как загрузить:*\n` +
      `Администратор должен отправить фото с подписью "текущий"`,
      { parse_mode: 'Markdown' }
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 10000);
  }
});

bot.onText(/🔄 График на цикл/, async (msg) => {
  const filePath = path.join(DATA_DIR, 'schedule_cycle.jpg');

  try {
    await fs.access(filePath);
    const photoBuffer = await fs.readFile(filePath);

    const photoMsg = await bot.sendPhoto(msg.chat.id, photoBuffer, {
      caption: `🔄 График для ${msg.from.first_name}`,
      reply_markup: MAIN_KEYBOARD
    });

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, photoMsg.message_id);
    }, 30000);

  } catch (error) {
    const errorMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `🔄 ${msg.from.first_name}, график еще не загружен\n\n` +
      `*Как загрузить:*\n` +
      `Администратор должен отправить фото с подписью "цикл"`,
      { parse_mode: 'Markdown' }
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 10000);
  }
});

// ==================== ОБОРОТЫ ТУРБИНЫ ====================
bot.onText(/⚙️ Обороты турбины/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const userName = msg.from.first_name;
  const key = `${chatId}_${userId}`;

  // Останавливаем предыдущий мониторинг
  if (userTimers.has(key)) {
    const { updateTimer, messageId, deletionTimer } = userTimers.get(key);
    if (updateTimer) clearInterval(updateTimer);
    if (deletionTimer) clearTimeout(deletionTimer);
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

  // Отправляем сообщение с мониторингом
  const turbineMsg = await bot.sendMessage(chatId,
    `⚙️ *Мониторинг для ${userName}*\n\n` +
    `🎯 Текущие обороты: *${initialRPM} об/мин*\n\n` +
    `📊 [${createProgressBar(initialRPM)}] ${Math.round(((initialRPM - 6896) / (6960 - 6896)) * 100)}%\n\n` +
    `ℹ️ Сообщение удалится через 30 секунд`,
    { parse_mode: 'Markdown', reply_markup: MAIN_KEYBOARD }
  );

  const messageId = turbineMsg.message_id;
  const startTime = Date.now();

  // Таймер удаления через 30 секунд
  const deletionTimer = setTimeout(() => {
    safeDeleteMessage(chatId, messageId);
    userTimers.delete(key);
  }, 30000);

  // Сохраняем данные
  userTimers.set(key, {
    deletionTimer,
    messageId,
    updateTimer: null,
    startTime
  });

  // Обновление каждые 2 секунды
  const updateTimer = setInterval(async () => {
    const newRPM = generateRPM();

    try {
      await bot.editMessageText(
        `⚙️ *Мониторинг для ${userName}*\n\n` +
        `🎯 Текущие обороты: *${newRPM} об/мин*\n\n` +
        `📊 [${createProgressBar(newRPM)}] ${Math.round(((newRPM - 6896) / (6960 - 6896)) * 100)}%\n\n` +
        `ℹ️ Сообщение удалится через ${Math.max(0, 30 - Math.floor((Date.now() - startTime) / 1000))} секунд`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );

      // Останавливаем обновления за 5 секунд до удаления
      if (Date.now() - startTime >= 25000) {
        clearInterval(updateTimer);
        const userData = userTimers.get(key);
        if (userData) {
          userTimers.set(key, { ...userData, updateTimer: null });
        }
      }

    } catch (error) {
      // Сообщение уже удалено - останавливаем таймеры
      clearInterval(updateTimer);
      clearTimeout(deletionTimer);
      userTimers.delete(key);
    }
  }, 2000);

  userTimers.set(key, {
    deletionTimer,
    messageId,
    updateTimer,
    startTime
  });
});

// ==================== АДМИН КОМАНДЫ ====================
bot.onText(/\/admin/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    await sendMessageWithPersistentKeyboard(msg.chat.id,
      `⛔ У вас нет прав администратора`
    );
    return;
  }

  const adminMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
    `👑 *Панель администратора*\n\n` +
    `📊 Активных мониторингов: ${userTimers.size}\n` +
    `📁 Папка данных: ${DATA_DIR}\n` +
    `👤 Ваш ID: ${msg.from.id}\n\n` +
    `*Команды:*\n` +
    `• Отправьте фото с подписью "текущий" - загрузить график текущего месяца\n` +
    `• Отправьте фото с подписью "цикл" - загрузить график на цикл`,
    { parse_mode: 'Markdown' }
  );

  setTimeout(() => {
    safeDeleteMessage(msg.chat.id, adminMsg.message_id);
  }, 15000);
});

// ==================== ОБЩИЕ СООБЩЕНИЯ ====================
bot.on('message', async (msg) => {
  // Пропускаем сообщения от бота
  if (msg.from.is_bot) return;

  // Пропускаем команды и фото
  if (msg.text?.startsWith('/')) return;
  if (msg.photo) return;

  // Пропускаем кнопки главного меню
  if (msg.text && (
    msg.text.includes('📅 График текущего месяца') ||
    msg.text.includes('🔄 График на цикл') ||
    msg.text.includes('👥 Контакты сотрудников') ||
    msg.text.includes('⚙️ Обороты турбины')
  )) {
    return;
  }

  // Для обычных текстовых сообщений показываем подсказку
  if (msg.text) {
    const hintMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `💡 ${msg.from.first_name}, используйте кнопки меню для навигации`
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, hintMsg.message_id);
      safeDeleteMessage(msg.chat.id, msg.message_id);
    }, 3000);
  }
});

// ==================== ПРОВЕРКА ФАЙЛОВ ПРИ ЗАПУСКЕ ====================
async function checkFilesOnStartup() {
  console.log('🔍 Проверяю файлы при запуске...');

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`✅ Папка данных: ${DATA_DIR}`);

    const contactsPath = path.join(DATA_DIR, 'contacts.json');
    try {
      await fs.access(contactsPath);
      console.log('✅ contacts.json найден');
    } catch {
      const defaultContacts = [
        {
          "name": "Иванов Иван Иванович",
          "position": "Старший инженер",
          "phone": "+7 (999) 123-45-67",
          "shift": "Дневная смена",
          "email": "ivanov@company.com"
        },
        {
          "name": "Петров Петр Петрович",
          "position": "Оператор турбины",
          "phone": "+7 (999) 987-65-43",
          "shift": "Ночная смена",
          "email": "petrov@company.com"
        }
      ];
      await fs.writeFile(contactsPath, JSON.stringify(defaultContacts, null, 2));
      console.log('✅ contacts.json создан по умолчанию');
    }

    const images = ['schedule_current.jpg', 'schedule_cycle.jpg'];
    for (const image of images) {
      const imagePath = path.join(DATA_DIR, image);
      try {
        await fs.access(imagePath);
        console.log(`✅ ${image} существует`);
      } catch {
        console.log(`⚠️ ${image} не найден`);
      }
    }

  } catch (error) {
    console.error('❌ Ошибка проверки файлов:', error);
  }
}

// ==================== ЗАПУСК БОТА ====================
checkFilesOnStartup().then(() => {
  console.log('\n✅ Бот готов к работе!');
  console.log('🎯 Главное меню всегда активно');
  console.log('⏱️ Автоудаление сообщений:');
  console.log('  • Мониторинг турбины: 30 секунд');
  console.log('  • Контакты/графики: 30 секунд');
  console.log('  • Подсказки: 3 секунды');
  console.log('👑 Администратор:', ADMIN_ID);
  console.log('='.repeat(50));

  bot.getMe().then(me => {
    console.log(`🤖 Бот: ${me.first_name} (@${me.username})`);
    console.log(`🔗 Ссылка: https://t.me/${me.username}`);
  }).catch(error => {
    console.error('❌ Ошибка получения информации о боте:', error);
  });
});

// Обработка остановки
process.on('SIGINT', () => {
  console.log('\n🛑 Останавливаю бота...');
  userTimers.forEach(({ updateTimer, deletionTimer }) => {
    if (updateTimer) clearInterval(updateTimer);
    if (deletionTimer) clearTimeout(deletionTimer);
  });
  userTimers.clear();
  console.log('✅ Все таймеры остановлены');
  bot.stopPolling();
  process.exit(0);
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка polling:', error.message);
});

bot.on('error', (error) => {
  console.error('❌ Общая ошибка бота:', error.message);
});