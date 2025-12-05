const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');

// ==================== КОНФИГУРАЦИЯ ====================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8533299703:AAGxj_5pjBFrmuYQnXwMROQF6MQ7ePPezDM';
const ADMIN_ID = '401369992';
const DATA_DIR = path.join(__dirname, 'data'); // Фиксированный путь

console.log('🚀 Бот запущен на Railway');
console.log('👑 Админ ID:', ADMIN_ID);
console.log('📁 Папка данных:', DATA_DIR);

const bot = new TelegramBot(TOKEN, { polling: true });

// ==================== ХРАНИЛИЩА ====================
const userTimers = new Map();
const userMessageQueue = new Map();

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function safeDeleteMessage(chatId, messageId) {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch (error) {
    // Игнорируем ошибки
  }
}

async function cleanupUserMessages(chatId, userId) {
  const key = `${chatId}_${userId}`;
  if (userMessageQueue.has(key)) {
    const messageIds = userMessageQueue.get(key);
    for (const messageId of messageIds) {
      await safeDeleteMessage(chatId, messageId);
    }
    userMessageQueue.delete(key);
  }
}

function addToUserQueue(chatId, userId, messageId) {
  const key = `${chatId}_${userId}`;
  if (!userMessageQueue.has(key)) {
    userMessageQueue.set(key, []);
  }
  userMessageQueue.get(key).push(messageId);

  // Ограничиваем очередь
  if (userMessageQueue.get(key).length > 5) {
    const oldestId = userMessageQueue.get(key).shift();
    safeDeleteMessage(chatId, oldestId);
  }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ФАЙЛОВОЙ СИСТЕМЫ ====================
async function initializeFileSystem() {
  console.log('📂 Инициализация файловой системы...');

  try {
    // Создаем папку data
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log('✅ Папка data создана');

    // Создаем contacts.json если нет
    const contactsPath = path.join(DATA_DIR, 'contacts.json');
    try {
      await fs.access(contactsPath);
      console.log('✅ contacts.json существует');
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
          "name": "Петрова Мария Сергеевна",
          "position": "Оператор турбины",
          "phone": "+7 (999) 987-65-43",
          "shift": "Ночная смена",
          "email": "petrova@company.com"
        }
      ];
      await fs.writeFile(contactsPath, JSON.stringify(defaultContacts, null, 2));
      console.log('✅ contacts.json создан по умолчанию');
    }

    // Проверяем картинки
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

    return true;
  } catch (error) {
    console.error('❌ Ошибка инициализации файловой системы:', error);
    return false;
  }
}

// ==================== ЗАГРУЗКА КАРТИНОК АДМИНИСТРАТОРОМ (ИСПРАВЛЕННАЯ) ====================
bot.on('photo', async (msg) => {
  // Проверяем администратора
  if (msg.from.id.toString() !== ADMIN_ID) {
    await safeDeleteMessage(msg.chat.id, msg.message_id);
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
    await safeDeleteMessage(msg.chat.id, msg.message_id);
    const askMsg = await bot.sendMessage(msg.chat.id,
      `📝 Укажите в подписи:\n• "текущий" - график месяца\n• "цикл" - график на цикл`
    );
    addToUserQueue(msg.chat.id, msg.from.id, askMsg.message_id);
    setTimeout(() => safeDeleteMessage(msg.chat.id, askMsg.message_id), 10000);
    return;
  }

  try {
    // Удаляем сообщение с фото
    await safeDeleteMessage(msg.chat.id, msg.message_id);

    // Создаем папку если нет
    await fs.mkdir(DATA_DIR, { recursive: true });

    // СКАЧИВАЕМ ФАЙЛ ПРАВИЛЬНО (ИСПРАВЛЕНО)
    const fileUrl = await bot.getFileLink(fileId);
    console.log(`📥 Скачиваю файл: ${fileUrl}`);

    // Для Railway нужно скачать через fetch
    const response = await fetch(fileUrl);
    const buffer = await response.arrayBuffer();

    // Сохраняем файл
    const filePath = path.join(DATA_DIR, fileName);
    await fs.writeFile(filePath, Buffer.from(buffer));

    console.log(`✅ ${description} загружен, размер: ${buffer.byteLength} байт`);

    // Отправляем подтверждение
    const confirmMsg = await bot.sendMessage(msg.chat.id,
      `✅ *${description} успешно загружен!*`,
      { parse_mode: 'Markdown' }
    );

    addToUserQueue(msg.chat.id, msg.from.id, confirmMsg.message_id);
    setTimeout(() => safeDeleteMessage(msg.chat.id, confirmMsg.message_id), 5000);

  } catch (error) {
    console.error('❌ Ошибка загрузки файла:', error);
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `❌ Ошибка: ${error.message}`
    );

    addToUserQueue(msg.chat.id, msg.from.id, errorMsg.message_id);
    setTimeout(() => safeDeleteMessage(msg.chat.id, errorMsg.message_id), 5000);
  }
});

// ==================== ГЛАВНОЕ МЕНЮ ====================
bot.onText(/\/menu|\/start/, async (msg) => {
  await cleanupUserMessages(msg.chat.id, msg.from.id);

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

  const menuMsg = await bot.sendMessage(msg.chat.id,
    `👋 ${msg.from.first_name}, выберите функцию:`,
    keyboard
  );

  addToUserQueue(msg.chat.id, msg.from.id, menuMsg.message_id);
});

// ==================== КОНТАКТЫ СОТРУДНИКОВ ====================
bot.onText(/👥 Контакты сотрудников|\/contacts/, async (msg) => {
  await safeDeleteMessage(msg.chat.id, msg.message_id);
  await cleanupUserMessages(msg.chat.id, msg.from.id);

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

    const contactsMsg = await bot.sendMessage(msg.chat.id, message, {
      parse_mode: 'Markdown'
    });

    addToUserQueue(msg.chat.id, msg.from.id, contactsMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, contactsMsg.message_id);
    }, 30000);

  } catch (error) {
    console.error('Ошибка контактов:', error);
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `📞 ${msg.from.first_name}, контакты загружаются...`
    );

    addToUserQueue(msg.chat.id, msg.from.id, errorMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 10000);
  }
});

// ==================== ГРАФИКИ (ИСПРАВЛЕННЫЕ ДЛЯ RAILWAY) ====================
bot.onText(/📅 График текущего месяца/, async (msg) => {
  await safeDeleteMessage(msg.chat.id, msg.message_id);
  await cleanupUserMessages(msg.chat.id, msg.from.id);

  const filePath = path.join(DATA_DIR, 'schedule_current.jpg');

  try {
    // Проверяем существование файла
    await fs.access(filePath);

    // Читаем файл
    const photoBuffer = await fs.readFile(filePath);

    // Отправляем фото как Buffer
    const photoMsg = await bot.sendPhoto(msg.chat.id, photoBuffer, {
      caption: `📅 График для ${msg.from.first_name}`
    });

    addToUserQueue(msg.chat.id, msg.from.id, photoMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, photoMsg.message_id);
    }, 30000);

  } catch (error) {
    console.error('График не найден:', error);
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `📅 ${msg.from.first_name}, график еще не загружен`
    );

    addToUserQueue(msg.chat.id, msg.from.id, errorMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 10000);
  }
});

bot.onText(/🔄 График на цикл/, async (msg) => {
  await safeDeleteMessage(msg.chat.id, msg.message_id);
  await cleanupUserMessages(msg.chat.id, msg.from.id);

  const filePath = path.join(DATA_DIR, 'schedule_cycle.jpg');

  try {
    await fs.access(filePath);
    const photoBuffer = await fs.readFile(filePath);

    const photoMsg = await bot.sendPhoto(msg.chat.id, photoBuffer, {
      caption: `🔄 График для ${msg.from.first_name}`
    });

    addToUserQueue(msg.chat.id, msg.from.id, photoMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, photoMsg.message_id);
    }, 30000);

  } catch (error) {
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `🔄 ${msg.from.first_name}, график еще не загружен`
    );

    addToUserQueue(msg.chat.id, msg.from.id, errorMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 10000);
  }
});

// ==================== ОБОРОТЫ ТУРБИНЫ ====================
bot.onText(/⚙️ Обороты турбины|\/turbine/, async (msg) => {
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const userName = msg.from.first_name;
  const key = `${chatId}_${userId}`;

  // Останавливаем предыдущий
  if (userTimers.has(key)) {
    const { updateTimer, messageId } = userTimers.get(key);
    if (updateTimer) clearInterval(updateTimer);
    safeDeleteMessage(chatId, messageId);
    userTimers.delete(key);
  }

  await cleanupUserMessages(msg.chat.id, msg.from.id);

  const generateRPM = () => Math.floor(Math.random() * (6960 - 6896 + 1)) + 6896;

  const createProgressBar = (rpm) => {
    const progress = Math.round(((rpm - 6896) / (6960 - 6896)) * 100);
    const filled = Math.round(progress / 10);
    const empty = 10 - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
  };

  const initialRPM = generateRPM();
  const turbineMsg = await bot.sendMessage(chatId,
    `⚙️ *Мониторинг для ${userName}*\n\n` +
    `🎯 Текущие обороты: *${initialRPM} об/мин*\n\n` +
    `📊 [${createProgressBar(initialRPM)}] ${Math.round(((initialRPM - 6896) / (6960 - 6896)) * 100)}%`,
    { parse_mode: 'Markdown' }
  );

  const messageId = turbineMsg.message_id;
  addToUserQueue(chatId, userId, messageId);

  // Удаление через 30 секунд
  const deletionTimer = setTimeout(() => {
    safeDeleteMessage(chatId, messageId);
    userTimers.delete(key);
  }, 30000);

  userTimers.set(key, {
    deletionTimer,
    messageId,
    updateTimer: null,
    startTime: Date.now()
  });

  // Обновление каждые 2 секунды
  const updateTimer = setInterval(async () => {
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

      const userData = userTimers.get(key);
      if (userData && Date.now() - userData.startTime >= 25000) {
        clearInterval(updateTimer);
        userTimers.set(key, { ...userData, updateTimer: null });
      }

    } catch (error) {
      clearInterval(updateTimer);
      if (userTimers.has(key)) {
        const userData = userTimers.get(key);
        if (userData.deletionTimer) clearTimeout(userData.deletionTimer);
        userTimers.delete(key);
      }
    }
  }, 2000);

  const userData = userTimers.get(key);
  userTimers.set(key, { ...userData, updateTimer });
});

// ==================== АДМИН КОМАНДЫ ====================
bot.onText(/\/admin/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    await safeDeleteMessage(msg.chat.id, msg.message_id);
    return;
  }

  await safeDeleteMessage(msg.chat.id, msg.message_id);
  await cleanupUserMessages(msg.chat.id, msg.from.id);

  const adminMsg = await bot.sendMessage(msg.chat.id,
    `👑 *Панель администратора*\n\n` +
    `📊 Активных мониторингов: ${userTimers.size}\n` +
    `👥 Очередь сообщений: ${userMessageQueue.size}`,
    { parse_mode: 'Markdown' }
  );

  addToUserQueue(msg.chat.id, msg.from.id, adminMsg.message_id);

  setTimeout(() => {
    safeDeleteMessage(msg.chat.id, adminMsg.message_id);
  }, 10000);
});

// ==================== ЗАПУСК ====================
initializeFileSystem().then(success => {
  if (success) {
    console.log('\n✅ Бот полностью готов к работе!');
    console.log('🎯 Особенности:');
    console.log('  • Сообщения удаляются сразу при нажатии');
    console.log('  • Файлы корректно загружаются на Railway');
    console.log('  • Исправлена загрузка картинок администратором');
    console.log('  • Автоудаление через 30 секунд');
    console.log('👑 Администратор: 401369992');
    console.log('='.repeat(50));
  } else {
    console.error('❌ Не удалось инициализировать файловую систему');
  }
});

process.on('SIGINT', () => {
  console.log('\n🛑 Останавливаю бота...');
  userTimers.forEach(({ updateTimer, deletionTimer }) => {
    if (updateTimer) clearInterval(updateTimer);
    if (deletionTimer) clearTimeout(deletionTimer);
  });
  userMessageQueue.clear();
  console.log('✅ Все таймеры остановлены');
  process.exit(0);
});