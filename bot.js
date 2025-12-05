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
    one_time_keyboard: false,
    selective: false,
    is_persistent: true
  }
};

const bot = new TelegramBot(TOKEN, { polling: true });

// ==================== ХРАНИЛИЩА ====================
const userTimers = new Map();

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function safeDeleteMessage(chatId, messageId) {
  return bot.deleteMessage(chatId, messageId).catch(error => {
    if (!error.message.includes('message to delete not found')) {
      console.log(`⚠️ Не удалось удалить сообщение ${messageId}:`, error.message);
    }
  });
}

async function sendMessageWithPersistentKeyboard(chatId, text, options = {}) {
  return bot.sendMessage(chatId, text, {
    ...MAIN_KEYBOARD,
    ...options,
    reply_markup: MAIN_KEYBOARD.reply_markup
  });
}

// ==================== ПРИВЕТСТВИЕ ====================
bot.onText(/\/start/, async (msg) => {
  // Удаляем сообщение с командой /start
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  await sendMessageWithPersistentKeyboard(msg.chat.id,
    `👋 Привет, ${msg.from.first_name}!\n\n` +
    `🎛️ *СИСТЕМА МОНИТОРИНГА ТУРБИН*`,
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
    // Удаляем сообщение с фото
    await safeDeleteMessage(msg.chat.id, msg.message_id);

    const askMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `📝 Укажите в подписи к фото:\n` +
      `• "текущий" - для графика текущего месяца\n` +
      `• "цикл" - для графика на цикл`
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

    const response = await fetch(fileUrl);
    const buffer = await response.arrayBuffer();

    const filePath = path.join(DATA_DIR, fileName);
    await fs.writeFile(filePath, Buffer.from(buffer));

    console.log(`✅ ${description} загружен, размер: ${buffer.byteLength} байт`);

    // Удаляем сообщение с фото
    await safeDeleteMessage(msg.chat.id, msg.message_id);

    const confirmMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `✅ *${description} успешно загружен!*`,
      { parse_mode: 'Markdown' }
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, confirmMsg.message_id);
    }, 5000);

  } catch (error) {
    console.error('❌ Ошибка загрузки файла:', error);

    // Удаляем сообщение с фото при ошибке
    await safeDeleteMessage(msg.chat.id, msg.message_id);

    const errorMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `❌ Ошибка загрузки файла`
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 5000);
  }
});

// ==================== КОНТАКТЫ СОТРУДНИКОВ ====================
bot.onText(/👥 Контакты сотрудников|\/contacts/, async (msg) => {
  // Удаляем сообщение с кнопкой СРАЗУ
  await safeDeleteMessage(msg.chat.id, msg.message_id);

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

    // Удаляем контакты через 30 секунд
    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, contactsMsg.message_id);
    }, 30000);

  } catch (error) {
    console.error('Ошибка загрузки контактов:', error);
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
  // Удаляем сообщение с кнопкой СРАЗУ
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  const filePath = path.join(DATA_DIR, 'schedule_current.jpg');

  try {
    await fs.access(filePath);

    const photoBuffer = await fs.readFile(filePath);

    const photoMsg = await bot.sendPhoto(msg.chat.id, photoBuffer, {
      caption: `📅 График для ${msg.from.first_name}`,
      ...MAIN_KEYBOARD
    });

    // Удаляем график через 30 секунд
    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, photoMsg.message_id);
    }, 30000);

  } catch (error) {
    console.error('График не найден:', error);
    const errorMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `📅 ${msg.from.first_name}, график еще не загружен\n\n` +
      `*Как загрузить:*\n` +
      `Отправьте фото с подписью "текущий"`,
      { parse_mode: 'Markdown' }
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 10000);
  }
});

bot.onText(/🔄 График на цикл/, async (msg) => {
  // Удаляем сообщение с кнопкой СРАЗУ
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  const filePath = path.join(DATA_DIR, 'schedule_cycle.jpg');

  try {
    await fs.access(filePath);

    const photoBuffer = await fs.readFile(filePath);

    const photoMsg = await bot.sendPhoto(msg.chat.id, photoBuffer, {
      caption: `🔄 График для ${msg.from.first_name}`,
      ...MAIN_KEYBOARD
    });

    // Удаляем график через 30 секунд
    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, photoMsg.message_id);
    }, 30000);

  } catch (error) {
    const errorMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `🔄 ${msg.from.first_name}, график еще не загружен\n\n` +
      `*Как загрузить:*\n` +
      `Отправьте фото с подписью "цикл"`,
      { parse_mode: 'Markdown' }
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 10000);
  }
});

// ==================== ОБОРОТЫ ТУРБИНЫ (удаление через 30 секунд) ====================
bot.onText(/⚙️ Обороты турбины|\/turbine/, async (msg) => {
  // Удаляем сообщение с кнопкой СРАЗУ
  await safeDeleteMessage(msg.chat.id, msg.message_id);

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
    `📊 [${createProgressBar(initialRPM)}] ${Math.round(((initialRPM - 6896) / (6960 - 6896)) * 100)}%`,
    { parse_mode: 'Markdown' }
  );

  const messageId = turbineMsg.message_id;

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

      // Проверяем прошло ли 25 секунд (останавливаем за 5 сек до удаления)
      const userData = userTimers.get(key);
      if (userData && Date.now() - userData.startTime >= 25000) {
        clearInterval(updateTimer);
        userTimers.set(key, { ...userData, updateTimer: null });
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

  const userData = userTimers.get(key);
  userTimers.set(key, { ...userData, updateTimer });
});

// ==================== АДМИН КОМАНДЫ ====================
bot.onText(/\/admin/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    // Удаляем сообщение от не-админа
    await safeDeleteMessage(msg.chat.id, msg.message_id);
    return;
  }

  // Удаляем сообщение с командой
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  const adminMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
    `👑 *Панель администратора*\n\n` +
    `📊 Активных мониторингов: ${userTimers.size}`,
    { parse_mode: 'Markdown' }
  );

  setTimeout(() => {
    safeDeleteMessage(msg.chat.id, adminMsg.message_id);
  }, 10000);
});

// ==================== ПРИВЕТСТВИЕ НОВЫХ УЧАСТНИКОВ ГРУППЫ ====================
bot.on('new_chat_members', (msg) => {
  const newMembers = msg.new_chat_members;

  newMembers.forEach(member => {
    if (member.id.toString() === bot.token.split(':')[0]) return;

    setTimeout(() => {
      sendMessageWithPersistentKeyboard(msg.chat.id,
        `👋 Добро пожаловать в группу, *${member.first_name}*!\n\n` +
        `*Я бот-помощник этой группы.*\n\n` +
        `📋 *Что я умею:*\n` +
        `• Показывать графики работы 📅\n` +
        `• Хранить контакты сотрудников 👥\n` +
        `• Показывать обороты турбины ⚙️\n\n` +
        `*Приятного общения в группе!*`,
        { parse_mode: 'Markdown' }
      );
    }, 1000);
  });
});

// ==================== УДАЛЕНИЕ СООБЩЕНИЙ С КНОПКАМИ ОТ ПОЛЬЗОВАТЕЛЕЙ ====================
bot.on('message', async (msg) => {
  // Пропускаем сообщения от бота
  if (msg.from.is_bot) return;

  // Пропускаем фото от администратора
  if (msg.photo && msg.from.id.toString() === ADMIN_ID) return;

  // Удаляем команды (они уже обрабатываются выше)
  if (msg.text?.startsWith('/')) return;

  // Проверяем, содержит ли сообщение кнопки из нашей клавиатуры
  const hasOurButtons = msg.text && (
    msg.text.includes('📅 График текущего месяца') ||
    msg.text.includes('🔄 График на цикл') ||
    msg.text.includes('👥 Контакты сотрудников') ||
    msg.text.includes('⚙️ Обороты турбины')
  );

  // Удаляем сообщения пользователей с нашими кнопками
  if (hasOurButtons) {
    await safeDeleteMessage(msg.chat.id, msg.message_id);
  }
});

// ==================== ОБНОВЛЕНИЕ КНОПОК У СУЩЕСТВУЮЩИХ ПОЛЬЗОВАТЕЛЕЙ ====================
// При любом сообщении от пользователя проверяем есть ли у него кнопки
bot.on('message', async (msg) => {
  if (msg.from.is_bot) return;

  // Отправляем пустое сообщение с клавиатурой, если у пользователя нет кнопок
  // Это "принудительно" показывает кнопки
  setTimeout(async () => {
    try {
      // Отправляем невидимое сообщение с клавиатурой
      const forceKeyboardMsg = await bot.sendMessage(msg.chat.id, ' ', {
        reply_markup: MAIN_KEYBOARD.reply_markup
      });

      // Сразу удаляем это сообщение
      await safeDeleteMessage(msg.chat.id, forceKeyboardMsg.message_id);
    } catch (error) {
      // Игнорируем ошибки
    }
  }, 100);
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
  console.log('🎯 4 кнопки ВСЕГДА видны в интерфейсе');
  console.log('🗑️ Удаляются: сообщения пользователей с кнопками');
  console.log('⏱️ Мониторинг турбины: удаление через 30 секунд');
  console.log('⏱️ Контакты/графики: удаление через 30 секунд');
  console.log('👑 Администратор: 401369992');
  console.log('='.repeat(50));

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
  userTimers.clear();
  console.log('✅ Все таймеры остановлены');
  process.exit(0);
});