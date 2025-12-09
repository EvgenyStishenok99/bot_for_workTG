const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// ==================== КОНФИГУРАЦИЯ ====================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8533299703:AAGxj_5pjBFrmuYQnXwMROQF6MQ7ePPezDM';
const ADMIN_ID = process.env.ADMIN_ID || '401369992';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// Глобальные переменные
let BOT_ID = null;
const userTimers = new Map();
const lastKeyboardUpdate = new Map();

// Минимальное логирование
console.log('🚀 Бот запускается...');

// Главная клавиатура
const MAIN_KEYBOARD = {
  keyboard: [
    ['📅 График текущего месяца'],
    ['🔄 График на квартал'],
    ['🤓 График экзаменов'],
    ['🚋 Расписание трамвая'],
    ['🛩️ График отпусков'],
    ['👥 Контакты сотрудников'],
    ['⚙️ Обороты турбины']
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
  is_persistent: true
};

const bot = new TelegramBot(TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  },
  request: {
    timeout: 10000,
    agentOptions: {
      keepAlive: true,
      maxSockets: 1
    }
  }
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function safeDeleteMessage(chatId, messageId) {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch (error) {
    // Только логируем если это не "сообщение не найдено"
    if (!error.message?.includes('message to delete not found') &&
      !error.message?.includes('сообщение для удаления не найдено')) {
      console.log(`⚠️ Не удалось удалить сообщение ${messageId}:`, error.code || error.message);
    }
  }
}

async function sendMessageWithPersistentKeyboard(chatId, text, options = {}) {
  try {
    const messageOptions = {
      ...options,
      reply_markup: MAIN_KEYBOARD
    };

    // Автоматический parse_mode для Markdown
    if (!options.parse_mode && (text.includes('*') || text.includes('_') || text.includes('`'))) {
      messageOptions.parse_mode = 'Markdown';
    }

    return await bot.sendMessage(chatId, text, messageOptions);
  } catch (error) {
    console.log(`❌ Ошибка отправки сообщения в ${chatId}:`, error.code || error.message);
    return null;
  }
}

// ==================== ПРИВЕТСТВИЕ ====================
bot.onText(/\/start/, async (msg) => {
  if (!msg?.chat?.id || !msg?.from) return;

  try {
    await safeDeleteMessage(msg.chat.id, msg.message_id);

    await sendMessageWithPersistentKeyboard(
      msg.chat.id,
      `👋 Привет, ${msg.from.first_name}!\n\n` +
      `Используйте кнопки ниже для работы с системой:\n\n` +
      `⚠️ *Не удаляйте это сообщение, иначе меню исчезнет*`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.log(`❌ Ошибка в /start:`, error.code || error.message);
  }
});

// ==================== ЗАГРУЗКА КАРТИНОК АДМИНИСТРАТОРОМ ====================
bot.on('photo', async (msg) => {
  if (!msg?.chat?.id || !msg?.from) return;

  const userId = msg.from.id.toString();
  if (userId !== ADMIN_ID) return;

  const caption = msg.caption?.toLowerCase()?.trim() || '';
  const fileId = msg.photo[msg.photo.length - 1]?.file_id;

  if (!fileId) return;

  let fileName, description;

  // Определяем тип файла по подписи
  if (caption.includes('текущий') || caption.includes('current')) {
    fileName = 'schedule_current.jpg';
    description = 'График текущего месяца';
  } else if (caption.includes('квартал') || caption.includes('cycle')) {
    fileName = 'schedule_cycle.jpg';
    description = 'График на квартал';
  } else if (caption.includes('экзамен') || caption.includes('exam')) {
    fileName = 'schedule_exams.jpg';
    description = 'График экзаменов';
  } else if (caption.includes('трамвай') || caption.includes('tram')) {
    fileName = 'schedule_tram.jpg';
    description = 'Расписание трамвая';
  } else if (caption.includes('отпуск') || caption.includes('vacation')) {
    fileName = 'schedule_vocation.jpg';
    description = 'График отпусков';
  } else {
    const askMsg = await sendMessageWithPersistentKeyboard(
      msg.chat.id,
      `📝 Укажите в подписи к фото:\n` +
      `• "текущий" - для графика текущего месяца\n` +
      `• "квартал" - для графика на квартал\n` +
      `• "экзамен" - для графика экзаменов\n` +
      `• "трамвай" - для расписания трамвая\n` +
      `• "отпуск" - для графика отпусков\n\n` +
      `Отправьте фото еще раз с нужной подписью.`
    );

    if (askMsg) {
      setTimeout(() => safeDeleteMessage(msg.chat.id, askMsg.message_id), 10000);
    }
    return;
  }

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const buffer = Buffer.from(response.data);
    const filePath = path.join(DATA_DIR, fileName);

    await fs.writeFile(filePath, buffer);
    console.log(`✅ ${description} загружен: ${(buffer.length / 1024).toFixed(1)} KB`);

    const confirmMsg = await sendMessageWithPersistentKeyboard(
      msg.chat.id,
      `✅ *${description} успешно загружен!*\n` +
      `Размер: ${(buffer.length / 1024).toFixed(1)} KB`,
      { parse_mode: 'Markdown' }
    );

    if (confirmMsg) {
      setTimeout(() => safeDeleteMessage(msg.chat.id, confirmMsg.message_id), 5000);
    }

  } catch (error) {
    console.log('❌ Ошибка загрузки файла:', error.code || error.message);

    const errorMsg = await sendMessageWithPersistentKeyboard(
      msg.chat.id,
      `❌ Ошибка загрузки файла: ${error.message?.substring(0, 50)}`
    );

    if (errorMsg) {
      setTimeout(() => safeDeleteMessage(msg.chat.id, errorMsg.message_id), 5000);
    }
  }
});

// ==================== ОБРАБОТКА КНОПОК ====================
async function handleButtonClick(msg, buttonText, fileName, description) {
  if (!msg?.chat?.id || !msg?.from) return;

  try {
    // Удаляем сообщение с кнопкой
    await safeDeleteMessage(msg.chat.id, msg.message_id);

    const filePath = path.join(DATA_DIR, fileName);

    try {
      await fs.access(filePath);
      const photoBuffer = await fs.readFile(filePath);

      const photoMsg = await bot.sendPhoto(msg.chat.id, photoBuffer, {
        caption: `${description}\n\n_Автоматически удалится через 30 секунд_`,
        reply_markup: MAIN_KEYBOARD,
        parse_mode: 'Markdown'
      });

      if (photoMsg) {
        setTimeout(() => safeDeleteMessage(msg.chat.id, photoMsg.message_id), 30000);
      }

    } catch (error) {
      const errorMsg = await sendMessageWithPersistentKeyboard(
        msg.chat.id,
        `${description.split(' ')[0]} ${msg.from.first_name}, файл еще не загружен\n\n` +
        `*Как загрузить:*\n` +
        `Администратор должен отправить фото с соответствующей подписью`,
        { parse_mode: 'Markdown' }
      );

      if (errorMsg) {
        setTimeout(() => safeDeleteMessage(msg.chat.id, errorMsg.message_id), 10000);
      }
    }
  } catch (error) {
    console.log(`❌ Ошибка обработки кнопки ${buttonText}:`, error.code || error.message);
  }
}

// Обработчики кнопок
bot.onText(/📅 График текущего месяца/, (msg) =>
  handleButtonClick(msg, '📅 График текущего месяца', 'schedule_current.jpg', '📅 График текущего месяца'));

bot.onText(/🔄 График на квартал/, (msg) =>
  handleButtonClick(msg, '🔄 График на квартал', 'schedule_cycle.jpg', '🔄 График на квартал'));

bot.onText(/🤓 График экзаменов/, (msg) =>
  handleButtonClick(msg, '🤓 График экзаменов', 'schedule_exams.jpg', '🤓 График экзаменов'));

bot.onText(/🚋 Расписание трамвая/, (msg) =>
  handleButtonClick(msg, '🚋 Расписание трамвая', 'schedule_tram.jpg', '🚋 Расписание трамвая'));

bot.onText(/🛩️ График отпусков/, (msg) =>
  handleButtonClick(msg, '🛩️ График отпусков', 'schedule_vocation.jpg', '🛩️ График отпусков'));

// ==================== КОНТАКТЫ СОТРУДНИКОВ ====================
bot.onText(/👥 Контакты сотрудников/, async (msg) => {
  if (!msg?.chat?.id || !msg?.from) return;

  try {
    await safeDeleteMessage(msg.chat.id, msg.message_id);

    const contacts = [
      {
        "name": "Полещук Виктор Васильевич",
        "position": "Старший машинист",
        "phone": "+375 29 720-99-64",
        "shift": "1"
      },
      {
        "name": "Сергиюк Дмитрий Анатольевич",
        "position": "Машинист",
        "phone": "+375 29 719-71-59",
        "shift": "1"
      },
      // ... остальные контакты (сокращено для краткости)
    ];

    let message = `📞 *Контакты сотрудников*\n\n`;

    contacts.forEach((contact, index) => {
      message += `*${index + 1}. ${contact.name}*\n`;
      message += `   🏢 ${contact.position}\n`;
      message += `   📱 ${contact.phone}\n`;
      if (contact.shift) message += `   🕐 Смена: ${contact.shift}\n`;
      message += `\n`;
    });

    message += `\n_Автоматически удалится через 30 секунд_`;

    const contactsMsg = await sendMessageWithPersistentKeyboard(msg.chat.id, message, {
      parse_mode: 'Markdown'
    });

    if (contactsMsg) {
      setTimeout(() => safeDeleteMessage(msg.chat.id, contactsMsg.message_id), 30000);
    }
  } catch (error) {
    console.log(`❌ Ошибка отправки контактов:`, error.code || error.message);
  }
});

// ==================== ОБОРОТЫ ТУРБИНЫ ====================
bot.onText(/⚙️ Обороты турбины/, async (msg) => {
  if (!msg?.chat?.id || !msg?.from) return;

  try {
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
      await safeDeleteMessage(chatId, messageId);
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
      `⚙️ *Мониторинг оборотов турбины*\n` +
      `👤 Для: ${userName}\n\n` +
      `🎯 Текущие обороты: *${initialRPM} об/мин*\n\n` +
      `📊 [${createProgressBar(initialRPM)}] ${Math.round(((initialRPM - 6896) / (6960 - 6896)) * 100)}%\n\n` +
      `_Автоматически удалится через 30 секунд_`,
      { parse_mode: 'Markdown' }
    );

    if (!turbineMsg) return;

    const messageId = turbineMsg.message_id;
    const startTime = Date.now();

    // Таймер удаления через 30 секунд
    const deletionTimer = setTimeout(() => {
      safeDeleteMessage(chatId, messageId);
      userTimers.delete(key);
    }, 30000);

    // Сохраняем данные
    const userData = {
      deletionTimer,
      messageId,
      updateTimer: null,
      startTime
    };

    // Обновление каждые 2 секунды
    const updateTimer = setInterval(async () => {
      const newRPM = generateRPM();
      const secondsLeft = Math.max(0, 30 - Math.floor((Date.now() - startTime) / 1000));

      try {
        await bot.editMessageText(
          `⚙️ *Мониторинг оборотов турбины*\n` +
          `👤 Для: ${userName}\n\n` +
          `🎯 Текущие обороты: *${newRPM} об/мин*\n\n` +
          `📊 [${createProgressBar(newRPM)}] ${Math.round(((newRPM - 6896) / (6960 - 6896)) * 100)}%\n\n` +
          `_Автоматически удалится через ${secondsLeft} секунд_`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
          }
        );

        // Останавливаем обновления за 5 секунд до удаления
        if (secondsLeft <= 5) {
          clearInterval(updateTimer);
          userData.updateTimer = null;
        }

      } catch (error) {
        // Сообщение уже удалено - останавливаем таймеры
        clearInterval(updateTimer);
        clearTimeout(deletionTimer);
        userTimers.delete(key);
      }
    }, 2000);

    userData.updateTimer = updateTimer;
    userTimers.set(key, userData);

  } catch (error) {
    console.log(`❌ Ошибка мониторинга турбины:`, error.code || error.message);
  }
});

// ==================== АДМИН КОМАНДЫ ====================
bot.onText(/\/admin/, async (msg) => {
  if (!msg?.chat?.id || !msg?.from) return;

  try {
    await safeDeleteMessage(msg.chat.id, msg.message_id);

    if (msg.from.id.toString() !== ADMIN_ID) {
      const errorMsg = await sendMessageWithPersistentKeyboard(msg.chat.id, `⛔ У вас нет прав администратора`);
      if (errorMsg) {
        setTimeout(() => safeDeleteMessage(msg.chat.id, errorMsg.message_id), 5000);
      }
      return;
    }

    const adminMsg = await sendMessageWithPersistentKeyboard(
      msg.chat.id,
      `👑 *Панель администратора*\n\n` +
      `📊 Активных мониторингов: ${userTimers.size}\n` +
      `📁 Папка данных: ${DATA_DIR}\n` +
      `👤 Ваш ID: ${msg.from.id}\n\n` +
      `*Команды:*\n` +
      `• Отправьте фото с подписью "текущий" - график текущего месяца\n` +
      `• "квартал" - график на квартал\n` +
      `• "экзамен" - график экзаменов\n` +
      `• "трамвай" - расписание трамвая\n` +
      `• "отпуск" - график отпусков\n\n` +
      `*Кнопки всегда видны в поле ввода текста*`,
      { parse_mode: 'Markdown' }
    );

    if (adminMsg) {
      setTimeout(() => safeDeleteMessage(msg.chat.id, adminMsg.message_id), 15000);
    }
  } catch (error) {
    console.log(`❌ Ошибка админ-панели:`, error.code || error.message);
  }
});

// ==================== ПРИВЕТСТВИЕ НОВЫХ УЧАСТНИКОВ ====================
bot.on('new_chat_members', async (msg) => {
  if (!msg?.chat?.id || !msg?.new_chat_members) return;

  const newMembers = msg.new_chat_members.filter(member =>
    !BOT_ID || member.id.toString() !== BOT_ID
  );

  if (newMembers.length === 0) return;

  setTimeout(async () => {
    try {
      const welcomeMsg = await sendMessageWithPersistentKeyboard(
        msg.chat.id,
        `👋 Добро пожаловать в группу, *${newMembers[0].first_name}*!\n\n` +
        `*Я бот-помощник этой группы.*\n\n` +
        `📋 *Что я умею:*\n` +
        `• Показывать графики работы 📅\n` +
        `• Хранить контакты сотрудников 👥\n` +
        `• Показывать обороты турбины ⚙️\n\n` +
        `*Кнопки всегда видны в поле ввода текста*\n` +
        `*Приятного общения в группе!*\n\n` +
        `*Для просмотра функционала введите /start*`,
        { parse_mode: 'Markdown' }
      );

      if (welcomeMsg) {
        setTimeout(() => safeDeleteMessage(msg.chat.id, welcomeMsg.message_id), 20000);
      }
    } catch (error) {
      console.log(`❌ Ошибка приветствия:`, error.code || error.message);
    }
  }, 1000);
});

// ==================== ВСЕГДА ВОЗВРАЩАЕМ КНОПКИ ====================
let keyboardThrottle = new Map();

bot.on('message', async (msg) => {
  if (!msg?.chat?.id || !msg?.from || msg.from.is_bot) return;

  // Не отправляем клавиатуру на специальные сообщения
  if (msg.photo && msg.from.id.toString() === ADMIN_ID) return;
  if (msg.text?.startsWith('/')) return;

  // Проверяем, не является ли это сообщением с кнопкой меню
  const buttonTexts = [
    '📅 График текущего месяца',
    '🔄 График на квартал',
    '🤓 График экзаменов',
    '🚋 Расписание трамвая',
    '🛩️ График отпусков',
    '👥 Контакты сотрудников',
    '⚙️ Обороты турбины'
  ];

  if (msg.text && buttonTexts.some(btn => msg.text.includes(btn))) {
    return;
  }

  // Throttle: не чаще чем раз в 3 секунды для одного пользователя
  const key = `${msg.chat.id}_${msg.from.id}`;
  const now = Date.now();
  const lastUpdate = keyboardThrottle.get(key) || 0;

  if (now - lastUpdate < 3000) return;

  keyboardThrottle.set(key, now);

  try {
    // Отправляем и сразу удаляем сообщение с клавиатурой
    const keyboardMsg = await bot.sendMessage(msg.chat.id, ' ', {
      reply_markup: MAIN_KEYBOARD
    });

    if (keyboardMsg) {
      await safeDeleteMessage(msg.chat.id, keyboardMsg.message_id);
    }
  } catch (error) {
    // Игнорируем тихие ошибки
  }
});

// ==================== ПРОВЕРКА ФАЙЛОВ ПРИ ЗАПУСКЕ ====================
async function checkFilesOnStartup() {
  console.log('🔍 Проверяю файлы...');

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`✅ Папка данных: ${DATA_DIR}`);

    const images = [
      { name: 'schedule_current.jpg', desc: 'График текущего месяца' },
      { name: 'schedule_cycle.jpg', desc: 'График на квартал' },
      { name: 'schedule_exams.jpg', desc: 'График экзаменов' },
      { name: 'schedule_tram.jpg', desc: 'Расписание трамвая' },
      { name: 'schedule_vocation.jpg', desc: 'График отпусков' }
    ];

    for (const image of images) {
      try {
        const imagePath = path.join(DATA_DIR, image.name);
        await fs.access(imagePath);
        const stats = await fs.stat(imagePath);
        console.log(`✅ ${image.desc}: ${(stats.size / 1024).toFixed(1)} KB`);
      } catch {
        console.log(`⚠️ ${image.desc}: не найден`);
      }
    }

  } catch (error) {
    console.log('❌ Ошибка проверки файлов:', error.code || error.message);
  }
}

// ==================== ЗАПУСК БОТА ====================
async function startBot() {
  await checkFilesOnStartup();

  try {
    const me = await bot.getMe();
    BOT_ID = me.id.toString();

    console.log('\n✅ Бот готов к работе!');
    console.log(`🤖 Бот: ${me.first_name} (@${me.username})`);
    console.log(`🆔 ID бота: ${BOT_ID}`);
    console.log(`👑 Админ ID: ${ADMIN_ID}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.log('❌ Ошибка запуска бота:', error.code || error.message);
    process.exit(1);
  }
}

startBot();

// ==================== ОЧИСТКА ПЕРИОДИЧЕСКАЯ ====================
setInterval(() => {
  // Очищаем старые записи throttle
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;

  for (const [key, timestamp] of keyboardThrottle.entries()) {
    if (timestamp < fiveMinutesAgo) {
      keyboardThrottle.delete(key);
    }
  }

  // Иногда логируем состояние
  if (Math.random() < 0.1) { // 10% chance
    console.log(`📊 Статистика: ${userTimers.size} активных мониторингов, ${keyboardThrottle.size} в кэше клавиатур`);
  }
}, 60000); // Каждую минуту

// ==================== ОБРАБОТКА ЗАВЕРШЕНИЯ ====================
process.on('SIGINT', () => {
  console.log('\n🛑 Останавливаю бота...');

  // Останавливаем все таймеры
  userTimers.forEach(({ updateTimer, deletionTimer }) => {
    if (updateTimer) clearInterval(updateTimer);
    if (deletionTimer) clearTimeout(deletionTimer);
  });

  userTimers.clear();
  keyboardThrottle.clear();

  console.log('✅ Все таймеры остановлены');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Получен SIGTERM, останавливаюсь...');
  bot.stopPolling();
  process.exit(0);
});

// ==================== ОБРАБОТКА ОШИБОК ====================
bot.on('polling_error', (error) => {
  console.log('❌ Ошибка polling:', error.code || error.message);
});

bot.on('error', (error) => {
  console.log('❌ Общая ошибка бота:', error.code || error.message);
});