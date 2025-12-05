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

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
// Безопасное удаление сообщений
function safeDeleteMessage(chatId, messageId) {
  return bot.deleteMessage(chatId, messageId).catch(error => {
    if (!error.message.includes('message to delete not found')) {
      console.log(`⚠️ Не удалось удалить сообщение ${messageId}:`, error.message);
    }
  });
}

// Планирование удаления
function scheduleDeletion(chatId, messageId, delaySeconds, type = 'default') {
  const key = `${chatId}_${messageId}`;

  // Очищаем старый таймер если есть
  if (deletionTimers.has(key)) {
    clearTimeout(deletionTimers.get(key));
  }

  // Устанавливаем новый таймер
  const timer = setTimeout(() => {
    safeDeleteMessage(chatId, messageId);
    deletionTimers.delete(key);
    console.log(`✅ Удалено сообщение типа "${type}" через ${delaySeconds} сек`);
  }, delaySeconds * 1000);

  deletionTimers.set(key, timer);
  return timer;
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
    // Если подпись не указана, просим уточнить
    const askMsg = await bot.sendMessage(msg.chat.id,
      `📝 Укажите в подписи к фото:\n` +
      `• "текущий" - для графика текущего месяца\n` +
      `• "цикл" - для графика на цикл`,
      { reply_to_message_id: msg.message_id }
    );

    scheduleDeletion(msg.chat.id, askMsg.message_id, 30, 'admin_ask');
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

    // Отправляем подтверждение
    const confirmMsg = await bot.sendMessage(msg.chat.id,
      `✅ *${description} успешно загружен!*\n\n` +
      `👤 Администратор: ${msg.from.first_name}\n` +
      `📁 Файл: ${fileName}`,
      {
        parse_mode: 'Markdown',
        reply_to_message_id: msg.message_id
      }
    );

    // Удаляем подтверждение через 30 секунд
    scheduleDeletion(msg.chat.id, confirmMsg.message_id, 30, 'admin_confirm');

    // Уведомляем группу если загружено в группе
    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
      const groupMsg = await bot.sendMessage(msg.chat.id,
        `📢 *Обновление!*\n\n` +
        `${description} был обновлен администратором.\n` +
        `Теперь доступен всем участникам.`,
        { parse_mode: 'Markdown' }
      );

      scheduleDeletion(msg.chat.id, groupMsg.message_id, 60, 'group_notify');
    }

  } catch (error) {
    console.error('❌ Ошибка загрузки файла:', error);
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `❌ Ошибка загрузки файла: ${error.message}`,
      { reply_to_message_id: msg.message_id }
    );

    scheduleDeletion(msg.chat.id, errorMsg.message_id, 30, 'admin_error');
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

  const menuMsg = await bot.sendMessage(msg.chat.id,
    `👋 ${msg.from.first_name}, выберите функцию:`,
    {
      ...keyboard,
      reply_to_message_id: msg.message_id
    }
  );

  // Удаляем меню через 60 секунд
  scheduleDeletion(msg.chat.id, menuMsg.message_id, 60, 'menu');
});

// ==================== КОНТАКТЫ СОТРУДНИКОВ (удаление через 100 сек) ====================
bot.onText(/👥 Контакты сотрудников|\/contacts/, async (msg) => {
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
      reply_to_message_id: msg.message_id
    });

    // УДАЛЕНИЕ ЧЕРЕЗ 100 СЕКУНД
    scheduleDeletion(msg.chat.id, contactsMsg.message_id, 100, 'contacts');

  } catch (error) {
    console.error('Ошибка загрузки контактов:', error);
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `📞 ${msg.from.first_name}, контакты загружаются...`,
      { reply_to_message_id: msg.message_id }
    );

    scheduleDeletion(msg.chat.id, errorMsg.message_id, 60, 'contacts_error');
  }
});

// ==================== ГРАФИКИ (удаление через 100 сек) ====================
bot.onText(/📅 График текущего месяца/, async (msg) => {
  const filePath = path.join(DATA_DIR, 'schedule_current.jpg');

  try {
    // Проверяем существование файла
    await fs.access(filePath);

    // Отправляем фото через путь (более надежно на Railway)
    const photoMsg = await bot.sendPhoto(msg.chat.id, filePath, {
      caption: `📅 График для ${msg.from.first_name}`,
      reply_to_message_id: msg.message_id
    });

    // УДАЛЕНИЕ ЧЕРЕЗ 100 СЕКУНД
    scheduleDeletion(msg.chat.id, photoMsg.message_id, 100, 'schedule_photo');

  } catch (error) {
    console.error('График не найден:', error);
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `📅 ${msg.from.first_name}, график еще не загружен\n\n` +
      `*Как загрузить:*\n` +
      `Отправьте фото с подписью "текущий"`,
      {
        parse_mode: 'Markdown',
        reply_to_message_id: msg.message_id
      }
    );

    scheduleDeletion(msg.chat.id, errorMsg.message_id, 60, 'schedule_error');
  }
});

bot.onText(/🔄 График на цикл/, async (msg) => {
  const filePath = path.join(DATA_DIR, 'schedule_cycle.jpg');

  try {
    await fs.access(filePath);

    const photoMsg = await bot.sendPhoto(msg.chat.id, filePath, {
      caption: `🔄 График для ${msg.from.first_name}`,
      reply_to_message_id: msg.message_id
    });

    // УДАЛЕНИЕ ЧЕРЕЗ 100 СЕКУНД
    scheduleDeletion(msg.chat.id, photoMsg.message_id, 100, 'schedule_photo');

  } catch (error) {
    const errorMsg = await bot.sendMessage(msg.chat.id,
      `🔄 ${msg.from.first_name}, график еще не загружен\n\n` +
      `*Как загрузить:*\n` +
      `Отправьте фото с подписью "цикл"`,
      {
        parse_mode: 'Markdown',
        reply_to_message_id: msg.message_id
      }
    );

    scheduleDeletion(msg.chat.id, errorMsg.message_id, 60, 'schedule_error');
  }
});

// ==================== ОБОРОТЫ ТУРБИНЫ (удаление через 30 сек) ====================
bot.onText(/⚙️ Обороты турбины|\/turbine/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const userName = msg.from.first_name;
  const key = `${chatId}_${userId}`;

  // Останавливаем предыдущий мониторинг
  if (userTimers.has(key)) {
    const { updateTimer, deletionTimer, messageId } = userTimers.get(key);
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
  const turbineMsg = await bot.sendMessage(chatId,
    `⚙️ *Мониторинг для ${userName}*\n\n` +
    `🎯 Текущие обороты: *${initialRPM} об/мин*\n\n` +
    `📊 [${createProgressBar(initialRPM)}] ${Math.round(((initialRPM - 6896) / (6960 - 6896)) * 100)}%`,
    {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id
    }
  );

  const messageId = turbineMsg.message_id;

  // УДАЛЕНИЕ ЧЕРЕЗ 30 СЕКУНД
  const deletionTimer = scheduleDeletion(chatId, messageId, 30, 'turbine');

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
    const deniedMsg = await bot.sendMessage(msg.chat.id,
      '⛔ Только для администратора',
      { reply_to_message_id: msg.message_id }
    );
    scheduleDeletion(msg.chat.id, deniedMsg.message_id, 10, 'admin_denied');
    return;
  }

  const adminMsg = await bot.sendMessage(msg.chat.id,
    `👑 *Панель администратора*\n\n` +
    `📊 Активных мониторингов: ${userTimers.size}\n` +
    `🗑️ Запланированных удалений: ${deletionTimers.size}\n\n` +
    `*Доступные команды:*\n` +
    `/cleartimers - очистить все таймеры\n` +
    `/uploadhelp - как загрузить графики`,
    {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id
    }
  );

  scheduleDeletion(msg.chat.id, adminMsg.message_id, 30, 'admin_panel');
});

bot.onText(/\/uploadhelp/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) return;

  const helpMsg = await bot.sendMessage(msg.chat.id,
    `📝 *Как загрузить графики:*\n\n` +
    `1. Отправьте фото боту\n` +
    `2. В подписи укажите:\n` +
    `   • "текущий" - для графика текущего месяца\n` +
    `   • "цикл" - для графика на цикл\n\n` +
    `Файлы сохраняются в: ${DATA_DIR}`,
    {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id
    }
  );

  scheduleDeletion(msg.chat.id, helpMsg.message_id, 60, 'upload_help');
});

bot.onText(/\/cleartimers/, async (msg) => {
  if (msg.from.id.toString() !== ADMIN_ID) return;

  let cleared = 0;

  // Очищаем таймеры мониторинга
  userTimers.forEach(({ updateTimer, deletionTimer }) => {
    if (updateTimer) {
      clearInterval(updateTimer);
      cleared++;
    }
    if (deletionTimer) {
      clearTimeout(deletionTimer);
      cleared++;
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
    `🧹 Очищено ${cleared} таймеров`,
    { reply_to_message_id: msg.message_id }
  );

  scheduleDeletion(msg.chat.id, clearMsg.message_id, 10, 'clear_timers');
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

  console.log('✅ Все таймеры остановлены');
  process.exit(0);
});

// ==================== ПРОВЕРКА ФАЙЛОВ ПРИ ЗАПУСКЕ ====================
async function checkFilesOnStartup() {
  console.log('🔍 Проверяю файлы при запуске...');

  try {
    // Проверяем папку данных
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`✅ Папка данных: ${DATA_DIR}`);

    // Проверяем contacts.json
    const contactsPath = path.join(DATA_DIR, 'contacts.json');
    try {
      await fs.access(contactsPath);
      console.log('✅ contacts.json найден');
    } catch {
      // Создаем файл по умолчанию
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
        console.log(`✅ ${image} найден`);
      } catch {
        console.log(`⚠️ ${image} не найден - загрузите через бота`);
      }
    }

  } catch (error) {
    console.error('❌ Ошибка проверки файлов:', error);
  }
}

// ==================== ЗАПУСК БОТА ====================
checkFilesOnStartup().then(() => {
  console.log('\n✅ Бот готов к работе!');
  console.log('⏱️ Тайминги удаления:');
  console.log('  • Графики и контакты: 100 секунд');
  console.log('  • Обороты турбины: 30 секунд');
  console.log('  • Меню: 60 секунд');
  console.log('  • Админ-сообщения: 30 секунд');
  console.log('👑 Администратор: 401369992');
  console.log('='.repeat(50));
});