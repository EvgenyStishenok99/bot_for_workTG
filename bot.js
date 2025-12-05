const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');

// ==================== КОНФИГУРАЦИЯ ====================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8533299703:AAGxj_5pjBFrmuYQnXwMROQF6MQ7ePPezDM';
const ADMIN_ID = '401369992'; // Ваш личный ID
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');

console.log('🚀 Бот запущен на Railway');
console.log('👑 Админ ID:', ADMIN_ID);
console.log('📁 Папка данных:', DATA_DIR);

const bot = new TelegramBot(TOKEN, { polling: true });

// ==================== ХРАНИЛИЩА ====================
const userTimers = new Map(); // Для мониторинга оборотов
const deletionTimers = new Map(); // Для автоудаления
const userMessageQueue = new Map(); // Очередь сообщений пользователя

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
// Безопасное удаление сообщений
function safeDeleteMessage(chatId, messageId) {
  return bot.deleteMessage(chatId, messageId).catch(error => {
    // Игнорируем ошибки удаления
    if (!error.message.includes('message to delete not found')) {
      console.log(`⚠️ Не удалось удалить сообщение ${messageId}:`, error.message);
    }
  });
}

// Удаление старых сообщений пользователя перед отправкой нового
async function cleanupUserMessages(chatId, userId) {
  const key = `${chatId}_${userId}`;

  if (userMessageQueue.has(key)) {
    const messageIds = userMessageQueue.get(key);

    // Удаляем все предыдущие сообщения этого пользователя
    for (const messageId of messageIds) {
      await safeDeleteMessage(chatId, messageId);
    }

    // Очищаем очередь
    userMessageQueue.delete(key);
  }
}

// Добавление сообщения в очередь пользователя
function addToUserQueue(chatId, userId, messageId) {
  const key = `${chatId}_${userId}`;

  if (!userMessageQueue.has(key)) {
    userMessageQueue.set(key, []);
  }

  userMessageQueue.get(key).push(messageId);

  // Ограничиваем очередь 5 сообщениями (удаляем самые старые)
  if (userMessageQueue.get(key).length > 5) {
    const oldestMessageId = userMessageQueue.get(key).shift();
    safeDeleteMessage(chatId, oldestMessageId);
  }
}

// ==================== ЗАГРУЗКА КАРТИНОК АДМИНИСТРАТОРОМ ====================
bot.on('photo', async (msg) => {
  // Проверяем что это администратор
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
    // Удаляем сообщение пользователя сразу
    await safeDeleteMessage(msg.chat.id, msg.message_id);

    const askMsg = await bot.sendMessage(msg.chat.id,
      `📝 Укажите в подписи к фото:\n` +
      `• "текущий" - для графика текущего месяца\n` +
      `• "цикл" - для графика на цикла`,
      { reply_to_message_id: null }
    );

    addToUserQueue(msg.chat.id, msg.from.id, askMsg.message_id);

    // Удаляем через 10 секунд
    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, askMsg.message_id);
    }, 10000);

    return;
  }

  try {
    // Создаем папку если нет
    await fs.mkdir(DATA_DIR, { recursive: true });

    // Скачиваем файл
    const fileStream = bot.getFileStream(fileId);
    const filePath = path.join(DATA_DIR, fileName);
    const writeStream = fs.createWriteStream(filePath);

    await new Promise((resolve, reject) => {
      fileStream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    console.log(`✅ ${description} загружен администратором ${msg.from.first_name}`);

    // Удаляем сообщение пользователя с фото
    await safeDeleteMessage(msg.chat.id, msg.message_id);

    // Отправляем подтверждение
    const confirmMsg = await bot.sendMessage(msg.chat.id,
      `✅ *${description} успешно загружен!*`,
      { parse_mode: 'Markdown' }
    );

    addToUserQueue(msg.chat.id, msg.from.id, confirmMsg.message_id);

    // Удаляем подтверждение через 5 секунд
    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, confirmMsg.message_id);
    }, 5000);

  } catch (error) {
    console.error('❌ Ошибка загрузки файла:', error);

    const errorMsg = await bot.sendMessage(msg.chat.id,
      `❌ Ошибка загрузки файла`,
      { reply_to_message_id: null }
    );

    addToUserQueue(msg.chat.id, msg.from.id, errorMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 5000);
  }
});

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

  // Очищаем старые сообщения пользователя
  await cleanupUserMessages(msg.chat.id, msg.from.id);

  const menuMsg = await bot.sendMessage(msg.chat.id,
    `👋 ${msg.from.first_name}, выберите функцию:`,
    {
      ...keyboard,
      reply_to_message_id: null
    }
  );

  addToUserQueue(msg.chat.id, msg.from.id, menuMsg.message_id);
});

// ==================== КОНТАКТЫ СОТРУДНИКОВ ====================
bot.onText(/👥 Контакты сотрудников|\/contacts/, async (msg) => {
  // Удаляем сообщение с кнопкой СРАЗУ
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  // Очищаем старые сообщения пользователя
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

    // Удаляем через 30 секунд
    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, contactsMsg.message_id);
    }, 30000);

  } catch (error) {
    console.error('Ошибка загрузки контактов:', error);
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `📞 ${msg.from.first_name}, контакты загружаются...`
    );

    addToUserQueue(msg.chat.id, msg.from.id, errorMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 10000);
  }
});

// ==================== ГРАФИКИ ====================
bot.onText(/📅 График текущего месяца/, async (msg) => {
  // Удаляем сообщение с кнопкой СРАЗУ
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  // Очищаем старые сообщения пользователя
  await cleanupUserMessages(msg.chat.id, msg.from.id);

  const filePath = path.join(DATA_DIR, 'schedule_current.jpg');

  try {
    await fs.access(filePath);

    const photoMsg = await bot.sendPhoto(msg.chat.id, filePath, {
      caption: `📅 График для ${msg.from.first_name}`
    });

    addToUserQueue(msg.chat.id, msg.from.id, photoMsg.message_id);

    // Удаляем через 30 секунд
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
  // Удаляем сообщение с кнопкой СРАЗУ
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  // Очищаем старые сообщения пользователя
  await cleanupUserMessages(msg.chat.id, msg.from.id);

  const filePath = path.join(DATA_DIR, 'schedule_cycle.jpg');

  try {
    await fs.access(filePath);

    const photoMsg = await bot.sendPhoto(msg.chat.id, filePath, {
      caption: `🔄 График для ${msg.from.first_name}`
    });

    addToUserQueue(msg.chat.id, msg.from.id, photoMsg.message_id);

    // Удаляем через 30 секунд
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
  // Удаляем сообщение с кнопкой СРАЗУ
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const userName = msg.from.first_name;
  const key = `${chatId}_${userId}`;

  // Останавливаем предыдущий мониторинг
  if (userTimers.has(key)) {
    const { updateTimer, messageId } = userTimers.get(key);
    if (updateTimer) clearInterval(updateTimer);
    safeDeleteMessage(chatId, messageId);
    userTimers.delete(key);
  }

  // Очищаем старые сообщения пользователя
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

  // УДАЛЕНИЕ ЧЕРЕЗ 30 СЕКУНД
  const deletionTimer = setTimeout(() => {
    safeDeleteMessage(chatId, messageId);
    userTimers.delete(key);
  }, 30000);

  // Сохраняем данные
  userTimers.set(key, {
    deletionTimer,
    messageId,
    updateTimer: null,
    startTime: Date.now()
  });

  // Обновляем сообщение каждые 2 секунды
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

      // Проверяем прошло ли 25 секунд (останавливаем за 5 сек до удаления)
      const userData = userTimers.get(key);
      if (userData && Date.now() - userData.startTime >= 25000) {
        clearInterval(updateTimer);
        const updatedData = userTimers.get(key);
        userTimers.set(key, { ...updatedData, updateTimer: null });
      }

    } catch (error) {
      // Сообщение уже удалено - останавливаем таймеры
      clearInterval(updateTimer);
      if (userTimers.has(key)) {
        const userData = userTimers.get(key);
        if (userData.deletionTimer) clearTimeout(userData.deletionTimer);
        userTimers.delete(key);
      }
    }
  }, 2000);

  // Сохраняем таймер обновления
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

  const adminMsg = await bot.sendMessage(msg.chat.id,
    `👑 *Панель администратора*\n\n` +
    `📊 Активных мониторингов: ${userTimers.size}\n` +
    `👥 Очередь сообщений: ${userMessageQueue.size}\n\n` +
    `*Доступные команды:*\n` +
    `/cleartimers - очистить все таймеры\n` +
    `/cleanqueue - очистить очередь сообщений`,
    { parse_mode: 'Markdown' }
  );

  addToUserQueue(msg.chat.id, msg.from.id, adminMsg.message_id);

  setTimeout(() => {
    safeDeleteMessage(msg.chat.id, adminMsg.message_id);
  }, 10000);
});

bot.onText(/\/cleartimers/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    await safeDeleteMessage(msg.chat.id, msg.message_id);
    return;
  }

  await safeDeleteMessage(msg.chat.id, msg.message_id);

  let cleared = 0;

  // Очищаем таймеры мониторинга
  userTimers.forEach(({ updateTimer, deletionTimer }, key) => {
    if (updateTimer) {
      clearInterval(updateTimer);
      cleared++;
    }
    if (deletionTimer) {
      clearTimeout(deletionTimer);
      cleared++;
    }

    // Удаляем сообщение мониторинга если есть
    const { messageId } = userTimers.get(key);
    if (messageId) {
      const [chatId, userId] = key.split('_');
      safeDeleteMessage(chatId, messageId);
    }
  });

  userTimers.clear();

  // Очищаем таймеры удаления
  deletionTimers.forEach(timer => {
    clearTimeout(timer);
    cleared++;
  });

  deletionTimers.clear();

  const clearMsg = await bot.sendMessage(msg.chat.id,
    `🧹 Очищено ${cleared} таймеров`
  );

  addToUserQueue(msg.chat.id, msg.from.id, clearMsg.message_id);

  setTimeout(() => {
    safeDeleteMessage(msg.chat.id, clearMsg.message_id);
  }, 5000);
});

bot.onText(/\/cleanqueue/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    await safeDeleteMessage(msg.chat.id, msg.message_id);
    return;
  }

  await safeDeleteMessage(msg.chat.id, msg.message_id);

  let deleted = 0;

  // Удаляем все сообщения из очереди
  userMessageQueue.forEach((messageIds, key) => {
    const [chatId, userId] = key.split('_');

    for (const messageId of messageIds) {
      safeDeleteMessage(chatId, messageId);
      deleted++;
    }
  });

  userMessageQueue.clear();

  const cleanMsg = await bot.sendMessage(msg.chat.id,
    `🗑️ Удалено ${deleted} сообщений из очереди`
  );

  addToUserQueue(msg.chat.id, msg.from.id, cleanMsg.message_id);

  setTimeout(() => {
    safeDeleteMessage(msg.chat.id, cleanMsg.message_id);
  }, 5000);
});

// ==================== ОЧИСТКА ПРИ ВЫХОДЕ ====================
process.on('SIGINT', () => {
  console.log('\n🛑 Останавливаю бота...');

  // Останавливаем все таймеры
  userTimers.forEach(({ updateTimer, deletionTimer }) => {
    if (updateTimer) clearInterval(updateTimer);
    if (deletionTimer) clearTimeout(deletionTimer);
  });

  deletionTimers.forEach(timer => clearTimeout(timer));

  userTimers.clear();
  deletionTimers.clear();
  userMessageQueue.clear();

  console.log('✅ Все таймеры остановлены');
  process.exit(0);
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
        }
      ];
      await fs.writeFile(contactsPath, JSON.stringify(defaultContacts, null, 2));
      console.log('✅ contacts.json создан по умолчанию');
    }

  } catch (error) {
    console.error('❌ Ошибка проверки файлов:', error);
  }
}

// ==================== ЗАПУСК БОТА ====================
checkFilesOnStartup().then(() => {
  console.log('\n✅ Бот готов к работе!');
  console.log('🎯 Сообщения удаляются сразу при нажатии');
  console.log('⏱️ Обороты турбины: удаление через 30 сек');
  console.log('📞 Контакты/графики: удаление через 30 сек');
  console.log('👑 Администратор: 401369992');
  console.log('='.repeat(50));
});