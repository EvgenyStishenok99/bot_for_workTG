const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');

// ==================== КОНФИГУРАЦИЯ ====================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8533299703:AAGxj_5pjBFrmuYQnXwMROQF6MQ7ePPezDM';
const ADMIN_ID = '401369992';
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');

console.log('🚀 Бот запущен на Railway');
console.log('👑 Админ ID:', ADMIN_ID);
console.log('📁 Папка данных:', DATA_DIR);

// Главная клавиатура (ВСЕГДА отображается)
const MAIN_KEYBOARD = {
  reply_markup: {
    keyboard: [
      ['📅 График текущего месяца'],
      ['🔄 График на цикл'],
      ['👥 Контакты сотрудников'],
      ['⚙️ Обороты турбины']
    ],
    resize_keyboard: true,
    one_time_keyboard: false, // Кнопки НЕ скрываются после нажатия
    selective: false
  }
};

const bot = new TelegramBot(TOKEN, { polling: true });

// ==================== ХРАНИЛИЩА ====================
const userTimers = new Map();
const userMessageQueue = new Map();

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function safeDeleteMessage(chatId, messageId) {
  return bot.deleteMessage(chatId, messageId).catch(error => {
    if (!error.message.includes('message to delete not found')) {
      console.log(`⚠️ Не удалось удалить сообщение ${messageId}:`, error.message);
    }
  });
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

  if (userMessageQueue.get(key).length > 5) {
    const oldestMessageId = userMessageQueue.get(key).shift();
    safeDeleteMessage(chatId, oldestMessageId);
  }
}

// ==================== ПРИВЕТСТВИЕ НОВЫХ ПОЛЬЗОВАТЕЛЕЙ ====================
bot.onText(/\/start/, async (msg) => {
  await cleanupUserMessages(msg.chat.id, msg.from.id);

  const welcomeMsg = await bot.sendMessage(msg.chat.id,
    `👋 Привет, ${msg.from.first_name}!\n\n` +
    `🎛️ *СИСТЕМА МОНИТОРИНГА ТУРБИН*\n\n` +
    `Выберите нужную функцию из кнопок ниже:`,
    {
      parse_mode: 'Markdown',
      ...MAIN_KEYBOARD
    }
  );

  addToUserQueue(msg.chat.id, msg.from.id, welcomeMsg.message_id);
});

// ==================== ПОКАЗ КНОПОК ПО КОМАНДЕ ====================
bot.onText(/\/menu|\/buttons/, async (msg) => {
  await cleanupUserMessages(msg.chat.id, msg.from.id);

  const menuMsg = await bot.sendMessage(msg.chat.id,
    `🎛️ Кнопки доступны внизу экрана\n` +
    `Просто нажмите на нужную функцию:`,
    MAIN_KEYBOARD
  );

  addToUserQueue(msg.chat.id, msg.from.id, menuMsg.message_id);
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
    const askMsg = await bot.sendMessage(msg.chat.id,
      `📝 Укажите в подписи к фото:\n` +
      `• "текущий" - для графика текущего месяца\n` +
      `• "цикл" - для графика на цикл`,
      MAIN_KEYBOARD
    );

    addToUserQueue(msg.chat.id, msg.from.id, askMsg.message_id);
    setTimeout(() => safeDeleteMessage(msg.chat.id, askMsg.message_id), 10000);
    return;
  }

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    // Исправленная загрузка файла
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

    // Скачиваем через fetch
    const response = await fetch(fileUrl);
    const buffer = await response.arrayBuffer();

    // Сохраняем файл
    const filePath = path.join(DATA_DIR, fileName);
    await fs.writeFile(filePath, Buffer.from(buffer));

    console.log(`✅ ${description} загружен, размер: ${buffer.byteLength} байт`);

    const confirmMsg = await bot.sendMessage(msg.chat.id,
      `✅ *${description} успешно загружен!*`,
      {
        parse_mode: 'Markdown',
        ...MAIN_KEYBOARD
      }
    );

    addToUserQueue(msg.chat.id, msg.from.id, confirmMsg.message_id);
    setTimeout(() => safeDeleteMessage(msg.chat.id, confirmMsg.message_id), 5000);

  } catch (error) {
    console.error('❌ Ошибка загрузки файла:', error);
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `❌ Ошибка загрузки файла`,
      MAIN_KEYBOARD
    );

    addToUserQueue(msg.chat.id, msg.from.id, errorMsg.message_id);
    setTimeout(() => safeDeleteMessage(msg.chat.id, errorMsg.message_id), 5000);
  }
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
      parse_mode: 'Markdown',
      ...MAIN_KEYBOARD
    });

    addToUserQueue(msg.chat.id, msg.from.id, contactsMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, contactsMsg.message_id);
    }, 30000);

  } catch (error) {
    console.error('Ошибка загрузки контактов:', error);
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `📞 ${msg.from.first_name}, контакты загружаются...`,
      MAIN_KEYBOARD
    );

    addToUserQueue(msg.chat.id, msg.from.id, errorMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 10000);
  }
});

// ==================== ГРАФИКИ ====================
bot.onText(/📅 График текущего месяца/, async (msg) => {
  await safeDeleteMessage(msg.chat.id, msg.message_id);
  await cleanupUserMessages(msg.chat.id, msg.from.id);

  const filePath = path.join(DATA_DIR, 'schedule_current.jpg');

  try {
    await fs.access(filePath);

    // Читаем файл как Buffer
    const photoBuffer = await fs.readFile(filePath);

    const photoMsg = await bot.sendPhoto(msg.chat.id, photoBuffer, {
      caption: `📅 График для ${msg.from.first_name}`,
      ...MAIN_KEYBOARD
    });

    addToUserQueue(msg.chat.id, msg.from.id, photoMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, photoMsg.message_id);
    }, 30000);

  } catch (error) {
    console.error('График не найден:', error);
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `📅 ${msg.from.first_name}, график еще не загружен\n\n` +
      `*Как загрузить:*\n` +
      `Отправьте фото с подписью "текущий"`,
      {
        parse_mode: 'Markdown',
        ...MAIN_KEYBOARD
      }
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
      caption: `🔄 График для ${msg.from.first_name}`,
      ...MAIN_KEYBOARD
    });

    addToUserQueue(msg.chat.id, msg.from.id, photoMsg.message_id);

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, photoMsg.message_id);
    }, 30000);

  } catch (error) {
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `🔄 ${msg.from.first_name}, график еще не загружен\n\n` +
      `*Как загрузить:*\n` +
      `Отправьте фото с подписью "цикл"`,
      {
        parse_mode: 'Markdown',
        ...MAIN_KEYBOARD
      }
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
    {
      parse_mode: 'Markdown',
      ...MAIN_KEYBOARD
    }
  );

  const messageId = turbineMsg.message_id;
  addToUserQueue(chatId, userId, messageId);

  // УДАЛЕНИЕ ЧЕРЕЗ 30 СЕКУНД
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
    return;
  }

  const adminMsg = await bot.sendMessage(msg.chat.id,
    `👑 *Панель администратора*\n\n` +
    `📊 Активных мониторингов: ${userTimers.size}\n` +
    `👥 Очередь сообщений: ${userMessageQueue.size}`,
    {
      parse_mode: 'Markdown',
      ...MAIN_KEYBOARD
    }
  );

  addToUserQueue(msg.chat.id, msg.from.id, adminMsg.message_id);

  setTimeout(() => {
    safeDeleteMessage(msg.chat.id, adminMsg.message_id);
  }, 10000);
});

bot.onText(/\/help/, async (msg) => {
  const helpMsg = await bot.sendMessage(msg.chat.id,
    `🎛️ *ПОМОЩЬ*\n\n` +
    `• 📅 График текущего месяца\n` +
    `• 🔄 График на цикл\n` +
    `• 👥 Контакты сотрудников\n` +
    `• ⚙️ Обороты турбины (30 сек)\n\n` +
    `Кнопки всегда видны внизу экрана!`,
    {
      parse_mode: 'Markdown',
      ...MAIN_KEYBOARD
    }
  );

  addToUserQueue(msg.chat.id, msg.from.id, helpMsg.message_id);

  setTimeout(() => {
    safeDeleteMessage(msg.chat.id, helpMsg.message_id);
  }, 15000);
});

// ==================== ПРИВЕТСТВИЕ НОВЫХ УЧАСТНИКОВ ГРУППЫ ====================
bot.on('new_chat_members', (msg) => {
  const newMembers = msg.new_chat_members;

  newMembers.forEach(member => {
    // Не приветствуем самого бота
    if (member.id.toString() === bot.token.split(':')[0]) return;

    setTimeout(() => {
      bot.sendMessage(msg.chat.id,
        `👋 Добро пожаловать в группу, *${member.first_name}*!\n\n` +
        `*Я бот-помощник этой группы.*\n\n` +
        `📋 *Что я умею:*\n` +
        `• Показывать графики работы 📅\n` +
        `• Хранить контакты сотрудников 👥\n` +
        `• Показывать обороты турбины ⚙️\n\n` +
        `Нажмите /start для получения кнопок меню!\n` +
        `*Приятного общения в группе!*`,
        {
          parse_mode: 'Markdown',
          ...MAIN_KEYBOARD
        }
      );
    }, 1000);
  });
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

  } catch (error) {
    console.error('❌ Ошибка проверки файлов:', error);
  }
}

// ==================== ЗАПУСК БОТА ====================
checkFilesOnStartup().then(() => {
  console.log('\n✅ Бот готов к работе!');
  console.log('🎯 4 кнопки всегда видны в интерфейсе');
  console.log('⏱️ Обороты турбины: удаление через 30 сек');
  console.log('📞 Контакты/графики: удаление через 30 сек');
  console.log('👑 Администратор: 401369992');
  console.log('='.repeat(50));

  // Отправляем уведомление о запуске
  bot.getMe().then(me => {
    console.log(`🤖 Бот: ${me.first_name} (@${me.username})`);
  });
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