const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// ==================== КОНФИГУРАЦИЯ ====================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8533299703:AAGxj_5pjBFrmuYQnXwMROQF6MQ7ePPezDM';
const ADMIN_ID = '401369992';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

console.log('🚀 Бот запущен');
console.log('👑 Админ ID:', ADMIN_ID);
console.log('📁 Папка данных:', DATA_DIR);

// Главная клавиатура (ВСЕГДА в поле ввода текста)
const MAIN_KEYBOARD = {
  keyboard: [
    ['📅 График текущего месяца'],
    ['🔄 График на цикл'],
    ['👥 Контакты сотрудников'],
    ['⚙️ Обороты турбины']
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
  is_persistent: true
};

const bot = new TelegramBot(TOKEN, {
  polling: true,
  request: {
    timeout: 10000
  }
});

// ==================== ХРАНИЛИЩА ====================
const userTimers = new Map();

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function safeDeleteMessage(chatId, messageId) {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch (error) {
    // Игнорируем ошибки "сообщение не найдено"
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

  // Если есть разметка Markdown, но не указан parse_mode
  if (!options.parse_mode && (text.includes('*') || text.includes('_') || text.includes('`'))) {
    messageOptions.parse_mode = 'Markdown';
  }

  return bot.sendMessage(chatId, text, messageOptions);
}

// ==================== ПРИВЕТСТВИЕ ====================
bot.onText(/\/start/, async (msg) => {
  // Удаляем только сообщение с командой /start
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  await sendMessageWithPersistentKeyboard(msg.chat.id,
    `👋 Привет, ${msg.from.first_name}!\n\n` +
    `🎛️ *СИСТЕМА МОНИТОРИНГА ТУРБИН*\n\n` +
    `Используйте кнопки ниже для работы с системой:`,
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
  // Удаляем сообщение с кнопкой СРАЗУ
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  // Ваши контакты
  const contacts = [
    {
      "name": "Полещук Виктор Васильевич",
      "position": "Старший машинист",
      "phone": "+375 29 720-99-64",
      "shift": "1",
      "telegram": ""

    },
    {
      "name": "Сергиюк Дмитрий Анатольевич",
      "position": "Машинист",
      "phone": "+375 29 719-71-59",
      "shift": "1",
      "telegram": ""
    },
    {
      "name": "Быховский Сергей Николаевич",
      "position": "Машинист(подменный старший машинист)",
      "phone": "+375 29 734-82-07",
      "shift": "1",
      "telegram": ""
    },
    {
      "name": "Мельник Игорь Яковлевич",
      "position": "Страший машинист",
      "phone": "+375 29 838-55-84",
      "shift": "2",
      "telegram": ""
    },
    {
      "name": "Гаркуша Денис Александрович",
      "position": "Машинист(подменный старший машинст)",
      "phone": "+375 29 738-53-84",
      "shift": "2",
      "telegram": ""
    },
    {
      "name": "Близнец Евгений Сергеевич",
      "position": "Машинст",
      "phone": "+375 44 729-42-58",
      "shift": "2",
      "telegram": ""
    },{
      "name": "Пикун Андрей Алексеевич",
      "position": "Старший машинист",
      "phone": "+375 29 731-11-26",
      "shift": "3",
      "telegram": ""
    },{
      "name": "Гадлевский Игорь Николаевич",
      "position": "Машинист(подменный старший машинст)",
      "phone": "+375 29 252-17-44",
      "shift": "3",
      "telegram": ""
    },{
      "name": "Стишенок Евгений Владимирович",
      "position": "Машинист",
      "phone": "+375 33 653-65-07",
      "shift": "3",
      "telegram": ""
    },{
      "name": "Тюсов Евгений Владимирович",
      "position": "Старший машинист",
      "phone": "+375 29 233-17-83",
      "shift": "4",
      "telegram": ""
    },{
      "name": "Дашкевич Василий Иванович",
      "position": "Машинист",
      "phone": "+375 29 715-28-35",
      "shift": "4",
      "telegram": ""
    },{
      "name": "Капитан Денис Владимирович",
      "position": "Машинист(подменный механик)",
      "phone": "+375 29 736-13-73",
      "shift": "4",
      "telegram": ""
    },{
      "name": "Когут Виталий Фёдорович",
      "position": "Старший машинист",
      "phone": "+375 29 739-27-34",
      "shift": "5",
      "telegram": ""
    },{
      "name": "Лебединский Иван Сергеевич",
      "position": "Машинист",
      "phone": "+375 29 738-48-58",
      "shift": "5",
      "telegram": ""
    },{
      "name": "Роговик Дмитрий Витальевич",
      "position": "Машинист",
      "phone": "+375 29 832-44-51",
      "shift": "5",
      "telegram": ""
    },{
      "name": "Хитрик Илья Николаевич",
      "position": "Подменный машинст(подменный механик)",
      "phone": "+375 29 201-50-76",
      "shift": "1,2,3,4,5",
      "telegram": ""
    },{
      "name": "Лагошенко Дмитрий Григорьевич",
      "position": "Подменный машинст",
      "phone": "+375 33 682-14-61",
      "shift": "1,2,3,4,5",
      "telegram": ""
    },{
      "name": "Коробкин Егор Сергеевич",
      "position": "Подменный машинст",
      "phone": "+375 33 904-29-35",
      "shift": "1,2,3,4,5",
      "telegram": ""
    },{
      "name": "Ходик Евгений Александрович",
      "position": "Механик",
      "phone": "+375 29 809-05-81",
      "shift": "",
      "telegram": ""
    },{
      "name": "Гаврук Александр Николавеич",
      "position": "Начальник ЛК6У-№1",
      "phone": "+375 29 738-01-15",
      "shift": "",
      "telegram": ""
    },{
      "name": "Пилипович ",
      "position": " Подменный начальник ЛК6У-№1",
      "phone": "",
      "shift": "",
      "telegram": ""
    }
  ]
  let message = `📞 *Контакты сотрудников*\n\n`;

  contacts.forEach((contact, index) => {
    message += `*${index + 1}. ${contact.name}*\n`;
    message += `   🏢 ${contact.position}\n`;
    message += `   📱 ${contact.phone}\n`;
    if (contact.shift) message += `   🕐 ${contact.shift}\n`;
    if (contact.email) message += `   📧 ${contact.email}\n`;
    message += `\n`;
  });

  message += `\n_Контакты автоматически удалятся через 30 секунд_`;

  const contactsMsg = await sendMessageWithPersistentKeyboard(msg.chat.id, message, {
    parse_mode: 'Markdown'
  });

  // Удаляем контакты через 30 секунд
  setTimeout(() => {
    safeDeleteMessage(msg.chat.id, contactsMsg.message_id);
  }, 30000);
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
      caption: `📅 График текущего месяца\n\n_Автоматически удалится через 30 секунд_`,
      reply_markup: MAIN_KEYBOARD,
      parse_mode: 'Markdown'
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
      `Администратор должен отправить фото с подписью "текущий"`,
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
      caption: `🔄 График на цикл\n\n_Автоматически удалится через 30 секунд_`,
      reply_markup: MAIN_KEYBOARD,
      parse_mode: 'Markdown'
    });

    // Удаляем график через 30 секунд
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
    `⚙️ *Мониторинг оборотов турбины*\n` +
    `👤 Для: ${userName}\n\n` +
    `🎯 Текущие обороты: *${initialRPM} об/мин*\n\n` +
    `📊 [${createProgressBar(initialRPM)}] ${Math.round(((initialRPM - 6896) / (6960 - 6896)) * 100)}%\n\n` +
    `_Автоматически удалится через 30 секунд_`,
    { parse_mode: 'Markdown' }
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
        `⚙️ *Мониторинг оборотов турбины*\n` +
        `👤 Для: ${userName}\n\n` +
        `🎯 Текущие обороты: *${newRPM} об/мин*\n\n` +
        `📊 [${createProgressBar(newRPM)}] ${Math.round(((newRPM - 6896) / (6960 - 6896)) * 100)}%\n\n` +
        `_Автоматически удалится через ${Math.max(0, 30 - Math.floor((Date.now() - startTime) / 1000))} секунд_`,
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
  // Удаляем сообщение с командой
  await safeDeleteMessage(msg.chat.id, msg.message_id);

  if (msg.from.id.toString() !== ADMIN_ID) {
    const errorMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
      `⛔ У вас нет прав администратора`
    );

    setTimeout(() => {
      safeDeleteMessage(msg.chat.id, errorMsg.message_id);
    }, 5000);
    return;
  }

  const adminMsg = await sendMessageWithPersistentKeyboard(msg.chat.id,
    `👑 *Панель администратора*\n\n` +
    `📊 Активных мониторингов: ${userTimers.size}\n` +
    `📁 Папка данных: ${DATA_DIR}\n` +
    `👤 Ваш ID: ${msg.from.id}\n\n` +
    `*Команды:*\n` +
    `• Отправьте фото с подписью "текущий" - загрузить график текущего месяца\n` +
    `• Отправьте фото с подписью "цикл" - загрузить график на цикл\n\n` +
    `*Кнопки всегда видны в поле ввода текста*`,
    { parse_mode: 'Markdown' }
  );

  setTimeout(() => {
    safeDeleteMessage(msg.chat.id, adminMsg.message_id);
  }, 15000);
});

// ==================== ОБЩИЕ СООБЩЕНИЯ В ГРУППЕ ====================
bot.on('message', async (msg) => {
  // Пропускаем сообщения от бота
  if (msg.from.is_bot) return;

  // ОБЫЧНЫЕ СООБЩЕНИЯ В ГРУППЕ НЕ УДАЛЯЕМ!
  // Это общий чат для общения

  // Но если это сообщение с кнопкой - удаляем сразу
  if (msg.text && (
    msg.text.includes('📅 График текущего месяца') ||
    msg.text.includes('🔄 График на цикл') ||
    msg.text.includes('👥 Контакты сотрудников') ||
    msg.text.includes('⚙️ Обороты турбины')
  )) {
    // Удаляем сообщение с кнопкой (но НЕ обычные сообщения пользователей!)
    // Этот код уже обрабатывается в соответствующих обработчиках выше
    return;
  }
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
        `*Кнопки всегда видны в поле ввода текста*\n` +
        `*Приятного общения в группе!*`,
        { parse_mode: 'Markdown' }
      );
    }, 1000);
  });
});

// ==================== ВСЕГДА ВОЗВРАЩАЕМ КНОПКИ ====================
// При любом сообщении отправляем "невидимое" сообщение с клавиатурой
// чтобы обновить интерфейс пользователя
bot.on('message', async (msg) => {
  if (msg.from.is_bot) return;

  // Не отправляем клавиатуру на фото от админа
  if (msg.photo && msg.from.id.toString() === ADMIN_ID) return;

  // Не отправляем клавиатуру на команды
  if (msg.text?.startsWith('/')) return;

  // Не отправляем клавиатуру на кнопки меню
  if (msg.text && (
    msg.text.includes('📅 График текущего месяца') ||
    msg.text.includes('🔄 График на цикл') ||
    msg.text.includes('👥 Контакты сотрудников') ||
    msg.text.includes('⚙️ Обороты турбины')
  )) {
    return;
  }

  // Для обычных сообщений пользователей - отправляем скрытое сообщение с клавиатурой
  // Это гарантирует, что кнопки всегда будут видны
  setTimeout(async () => {
    try {
      // Отправляем сообщение с клавиатурой и сразу удаляем его
      const keyboardMsg = await bot.sendMessage(msg.chat.id, ' ', {
        reply_markup: MAIN_KEYBOARD
      });

      // Сразу удаляем это сообщение
      await safeDeleteMessage(msg.chat.id, keyboardMsg.message_id);
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
  console.log('🎯 Кнопки ВСЕГДА в поле ввода текста');
  console.log('🗑️ Удаление:');
  console.log('  • Сообщения с кнопками - сразу');
  console.log('  • Графики/контакты/мониторинг - через 30 секунд');
  console.log('  • Обычные сообщения в чате - НЕ удаляются');
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