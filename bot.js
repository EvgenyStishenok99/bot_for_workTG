require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');
const express = require('express');

// ====================
// КОНФИГУРАЦИЯ
// ====================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8533299703:AAGxj_5pjBFrmuYQnXwMROQF6MQ7ePPezDM';
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const ADMIN_ID = process.env.ADMIN_ID;

// Проверяем наличие ID группы
if (!GROUP_CHAT_ID) {
  console.error('❌ ОШИБКА: GROUP_CHAT_ID не указан в .env файле');
  console.log('🚀 Запустите команду для получения ID:');
  console.log('npm run get-id');
  console.log('Или добавьте GROUP_CHAT_ID в .env файл вручную');
  process.exit(1);
}

// ====================
// ИНИЦИАЛИЗАЦИЯ
// ====================
console.log('🤖 Запускаю бота для группы...');
console.log('📱 ID группы:', GROUP_CHAT_ID);
console.log('👑 ID администратора:', ADMIN_ID || 'не указан');

const bot = new TelegramBot(TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 10 }
  }
});

// ====================
// СТРУКТУРА ДАННЫХ
// ====================
const DATA_DIR = path.join(__dirname, 'data');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');

// ====================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ====================
// Функция для удаления сообщений
const deleteMessage = async (chatId, messageId) => {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch (error) {
    // Игнорируем ошибки (сообщение уже удалено и т.д.)
  }
};

// Функция для отправки временного сообщения (100 секунд)
const sendTempMessage = async (chatId, text, options = {}, userMessageId = null) => {
  try {
    // Сначала удаляем сообщение пользователя, если указано
    if (userMessageId) {
      await deleteMessage(chatId, userMessageId);
    }

    // Отправляем ответ
    const message = await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...options
    });

    // Удаляем ответ через 100 секунд
    setTimeout(() => deleteMessage(chatId, message.message_id), 100000);

    return message;
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error);
    return null;
  }
};

// Функция для отправки временного фото (100 секунд)
const sendTempPhoto = async (chatId, photo, caption, userMessageId = null) => {
  try {
    // Сначала удаляем сообщение пользователя, если указано
    if (userMessageId) {
      await deleteMessage(chatId, userMessageId);
    }

    // Отправляем фото
    const message = await bot.sendPhoto(chatId, photo, {
      caption: caption,
      parse_mode: 'Markdown'
    });

    // Удаляем фото через 100 секунд
    setTimeout(() => deleteMessage(chatId, message.message_id), 100000);

    return message;
  } catch (error) {
    console.error('Ошибка отправки фото:', error);
    return null;
  }
};

// Создаем структуру папок
(async () => {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log('✅ Создана папка data/');
  }

  // Создаем файл контактов по умолчанию
  try {
    await fs.access(CONTACTS_FILE);
  } catch {
    const defaultContacts = [
      {
        "name": "Иванов Иван Иванович",
        "position": "Старший инженер",
        "phone": "+7 (999) 123-45-67",
        "shift": "Дневная смена",
        "email": "ivanov@example.com"
      },
      {
        "name": "Петрова Мария Сергеевна",
        "position": "Оператор турбины",
        "phone": "+7 (999) 987-65-43",
        "shift": "Ночная смена",
        "email": "petrova@example.com"
      },
      {
        "name": "Сидоров Алексей Петрович",
        "position": "Начальник смены",
        "phone": "+7 (999) 555-33-22",
        "shift": "Сменный график",
        "email": "sidorov@example.com"
      }
    ];
    await fs.writeFile(CONTACTS_FILE, JSON.stringify(defaultContacts, null, 2));
    console.log('✅ Создан файл контактов по умолчанию');
  }
})();

// ====================
// ХРАНИЛИЩЕ СОСТОЯНИЙ
// ====================
const activeTurbineTimers = new Map();

// ====================
// КЛАВИАТУРЫ
// ====================
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      ['📅 График текущего месяца'],
      ['🔄 График на цикл'],
      ['👥 Контакты сотрудников'],
      ['⚙️ Обороты турбины']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// ====================
// ОСНОВНЫЕ КОМАНДЫ
// ====================
// Команда /start или /menu
bot.onText(/\/start|\/menu/, async (msg) => {
  if (msg.chat.id.toString() !== GROUP_CHAT_ID && msg.chat.id.toString() !== ADMIN_ID) return;

  const userName = msg.from.first_name || 'Коллега';

  await sendTempMessage(msg.chat.id,
    `👋 *${userName}, добро пожаловать!*\n\n` +
    `*Я бот для мониторинга турбин.*\n\n` +
    `📋 *Доступные функции:*\n` +
    `• 📅 График текущего месяца\n` +
    `• 🔄 График на цикл\n` +
    `• 👥 Контакты сотрудников\n` +
    `• ⚙️ Обороты турбины (онлайн)\n\n` +
    `*Просто нажмите на нужную кнопку ниже!*\n\n` +
    `⏱️ *Это сообщение удалится через 100 секунд*`,
    {
      reply_markup: {
        keyboard: [
          ['📅 График текущего месяца'],
          ['🔄 График на цикл'],
          ['👥 Контакты сотрудников'],
          ['⚙️ Обороты турбины']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    },
    msg.message_id
  );
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;

  await sendTempMessage(chatId,
    `*📋 Справка по командам:*\n\n` +
    `*Основные команды:*\n` +
    `/start или /menu — главное меню\n` +
    `/help — эта справка\n` +
    `/contacts — контакты сотрудников\n` +
    `/turbine — обороты турбины\n` +
    `/stop — остановить мониторинг\n\n` +
    `*Кнопки меню:*\n` +
    `📅 — График текущего месяца\n` +
    `🔄 — График на цикл\n` +
    `👥 — Контакты сотрудников\n` +
    `⚙️ — Запустить мониторинг оборотов\n\n` +
    `💡 *Совет:* Вы можете свободно общаться в группе!\n` +
    `Бот не мешает обычному общению.\n\n` +
    `⏱️ *Это сообщение удалится через 100 секунд*`,
    { parse_mode: 'Markdown' },
    msg.message_id
  );
});

// ====================
// ОБРАБОТКА КНОПОК
// ====================
// 📅 График текущего месяца
bot.onText(/📅 График текущего месяца/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Участник';
  const filePath = path.join(DATA_DIR, 'schedule_current.jpg');

  try {
    await fs.access(filePath);

    await sendTempPhoto(chatId, filePath,
      `📅 *График работы на текущий месяц*\n👤 Запросил: ${userName}\n\n⏱️ *Это сообщение удалится через 100 секунд*`,
      msg.message_id
    );

  } catch (error) {
    await sendTempMessage(chatId,
      `⚠️ *График на текущий месяц еще не загружен*\n\n` +
      `Для загрузки графика:\n` +
      `1. Сохраните фото как "schedule_current.jpg"\n` +
      `2. Поместите в папку /data/\n` +
      `3. Перезапустите бота командой /start\n\n` +
      `⏱️ *Это сообщение удалится через 100 секунд*`,
      { parse_mode: 'Markdown' },
      msg.message_id
    );
  }
});

// 🔄 График на цикл
bot.onText(/🔄 График на цикл/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Участник';
  const filePath = path.join(DATA_DIR, 'schedule_cycle.jpg');

  try {
    await fs.access(filePath);

    await sendTempPhoto(chatId, filePath,
      `🔄 *График работы на цикл*\n👤 Запросил: ${userName}\n\n⏱️ *Это сообщение удалится через 100 секунд*`,
      msg.message_id
    );

  } catch (error) {
    await sendTempMessage(chatId,
      `⚠️ *График на цикл еще не загружен*\n\n` +
      `Для загрузки графика:\n` +
      `1. Сохраните фото как "schedule_cycle.jpg"\n` +
      `2. Поместите в папку /data/\n` +
      `3. Перезапустите бота командой /start\n\n` +
      `⏱️ *Это сообщение удалится через 100 секунд*`,
      { parse_mode: 'Markdown' },
      msg.message_id
    );
  }
});

// 👥 Контакты сотрудников
bot.onText(/👥 Контакты сотрудников|\/contacts/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Участник';

  console.log(`📞 Запрос контактов от ${userName} (ID: ${msg.from.id})`);

  try {
    const fs = require('fs').promises;
    const path = require('path');
    const contactsFile = path.join(__dirname, 'data', 'contacts.json');

    const data = await fs.readFile(contactsFile, 'utf8');
    const contacts = JSON.parse(data);

    console.log(`✅ Прочитано ${contacts.length} контактов`);

    if (contacts.length === 0) {
      await sendTempMessage(chatId,
        `📞 *Контакты сотрудников*\n\n` +
        `Список контактов пуст.\n` +
        `Добавьте данные в файл: \`data/contacts.json\`\n\n` +
        `⏱️ *Это сообщение удалится через 100 секунд*`,
        { parse_mode: 'Markdown' },
        msg.message_id
      );
      return;
    }

    let message = `📞 *КОНТАКТЫ СОТРУДНИКОВ*\n\n`;
    message += `👤 Запросил: ${userName}\n`;
    message += `👥 Всего сотрудников: ${contacts.length}\n\n`;
    message += `════════════════════════════\n\n`;

    // Ограничим количество контактов для одного сообщения
    const maxContacts = 5;
    const contactsToShow = contacts.slice(0, maxContacts);

    contactsToShow.forEach((contact, index) => {
      message += `*${index + 1}. ${contact.name}*\n`;
      message += `   🏢 *Должность:* ${contact.position}\n`;
      message += `   📱 *Телефон:* \`${contact.phone}\`\n`;

      if (contact.shift) {
        message += `   🕐 *Бригада:* ${contact.shift}\n`;
      }

      if (contact.email) {
        message += `   📧 *Email:* ${contact.email}\n`;
      }

      message += `\n`;

      if ((index + 1) % 3 === 0 && index !== contactsToShow.length - 1) {
        message += `════════════════════════════\n\n`;
      }
    });

    if (contacts.length > maxContacts) {
      message += `\n📋 *Показано ${maxContacts} из ${contacts.length} контактов*\n`;
      message += `Для полного списка обратитесь к администратору.\n\n`;
    }

    message += `📅 *Последнее обновление:* ${new Date().toLocaleDateString()}\n\n`;
    message += `⏱️ *Это сообщение удалится через 100 секунд*`;

    await sendTempMessage(chatId, message, { parse_mode: 'Markdown' }, msg.message_id);
    console.log(`✅ Контакты отправлены ${userName}`);

  } catch (error) {
    console.error('❌ Ошибка при чтении контактов:', error);

    let errorMessage = `❌ *Ошибка при загрузке контактов*\n\n`;

    if (error.code === 'ENOENT') {
      errorMessage += `Файл \`data/contacts.json\` не найден!\n\n`;
      errorMessage += `*Как исправить:*\n`;
      errorMessage += `1. Создайте папку \`data/\`\n`;
      errorMessage += `2. Создайте файл \`contacts.json\`\n`;
      errorMessage += `3. Добавьте данные в формате JSON`;
    } else if (error instanceof SyntaxError) {
      errorMessage += `Ошибка в формате JSON файла!\n\n`;
      errorMessage += `*Как исправить:*\n`;
      errorMessage += `1. Откройте \`data/contacts.json\`\n`;
      errorMessage += `2. Проверьте правильность JSON\n`;
      errorMessage += `3. Используйте онлайн валидатор JSON`;
    } else {
      errorMessage += `Ошибка: ${error.message}`;
    }

    errorMessage += `\n\n⏱️ *Это сообщение удалится через 100 секунд*`;

    await sendTempMessage(chatId, errorMessage, { parse_mode: 'Markdown' }, msg.message_id);
  }
});

// ====================
// ⚙️ ОБОРОТЫ ТУРБИНЫ
// ====================
bot.onText(/⚙️ Обороты турбины|\/turbine/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Участник';

  // Сначала удаляем сообщение пользователя
  await deleteMessage(chatId, msg.message_id);

  // Останавливаем предыдущий таймер
  if (activeTurbineTimers.has(chatId)) {
    const { timer } = activeTurbineTimers.get(chatId);
    clearInterval(timer);
    activeTurbineTimers.delete(chatId);
  }

  // Генерация случайного числа
  const generateRPM = () => Math.floor(Math.random() * (6960 - 6896 + 1)) + 6896;

  // Отправляем начальное сообщение
  const initialRPM = generateRPM();
  const initialMessage =
    `⚙️ *МОНИТОРИНГ ОБОРОТОВ ТУРБИНЫ*\n\n` +
    `👤 Запустил: ${userName}\n` +
    `🕒 Время: ${new Date().toLocaleTimeString()}\n\n` +
    `🎯 *ТЕКУЩИЕ ОБОРОТЫ:*\n` +
    `📊 **${initialRPM} об/мин**\n\n` +
    `📡 *Режим онлайн-мониторинга*\n\n` +
    `⏱️ *Это сообщение удалится через 30 секунд*`;

  const sentMessage = await bot.sendMessage(chatId, initialMessage, {
    parse_mode: 'Markdown'
  });

  if (!sentMessage) return;

  const messageId = sentMessage.message_id;

  // Удаляем сообщение через 30 секунд
  const deletionTimer = setTimeout(() => {
    deleteMessage(chatId, messageId);
    if (activeTurbineTimers.has(chatId)) {
      const { timer } = activeTurbineTimers.get(chatId);
      clearInterval(timer);
      activeTurbineTimers.delete(chatId);
    }
  }, 30000);

  // Функция обновления
  const updateTurbine = async () => {
    const newRPM = generateRPM();
    const updatedMessage =
      `⚙️ *МОНИТОРИНГ ОБОРОТОВ ТУРБИНЫ*\n\n` +
      `👤 Запустил: ${userName}\n` +
      `🕒 Время: ${new Date().toLocaleTimeString()}\n\n` +
      `🎯 *ТЕКУЩИЕ ОБОРОТЫ:*\n` +
      `📊 **${newRPM} об/мин**\n\n` +
      `📡 *Режим онлайн-мониторинга*\n\n` +
      `⏱️ *Это сообщение удалится через 30 секунд*`;

    try {
      await bot.editMessageText(updatedMessage, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
    } catch (err) {
      // Если сообщение устарело или удалено
      if (err.response?.body?.error_code === 400 || err.response?.body?.description?.includes('message to edit not found')) {
        clearInterval(timer);
        clearTimeout(deletionTimer);
        activeTurbineTimers.delete(chatId);
      }
    }
  };

  // Запускаем таймер обновления
  const timer = setInterval(updateTurbine, 2000);
  activeTurbineTimers.set(chatId, { timer, messageId, userName, deletionTimer });

  console.log(`✅ Запущен мониторинг в чате ${chatId}`);
});

// ====================
// АДМИН ФУНКЦИИ
// ====================
// Загрузка фото от админа
bot.on('photo', async (msg) => {
  if (ADMIN_ID && msg.from.id.toString() !== ADMIN_ID) return;

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
    return;
  }

  try {
    const filePath = await bot.downloadFile(fileId, DATA_DIR);
    const newPath = path.join(DATA_DIR, fileName);
    await fs.rename(filePath, newPath);

    // Удаляем сообщение с фото от админа
    await deleteMessage(msg.chat.id, msg.message_id);

    // Уведомляем админа
    await sendTempMessage(msg.chat.id,
      `✅ *${description} успешно обновлен!*\n\n` +
      `👤 Загрузил: ${msg.from.first_name}\n` +
      `🕒 Время: ${new Date().toLocaleString()}\n\n` +
      `Теперь все участники могут просматривать обновленный график.\n\n` +
      `⏱️ *Это сообщение удалится через 100 секунд*`,
      { parse_mode: 'Markdown' }
    );

    // Уведомляем группу
    if (msg.chat.id.toString() !== GROUP_CHAT_ID) {
      await sendTempMessage(GROUP_CHAT_ID,
        `📢 *ОБНОВЛЕНИЕ!*\n\n` +
        `✅ ${description} был обновлен администратором.\n` +
        `👤 ${msg.from.first_name}\n` +
        `🕒 ${new Date().toLocaleTimeString()}\n\n` +
        `⏱️ *Это сообщение удалится через 100 секунд*`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.error('Ошибка загрузки файла:', error);
    await sendTempMessage(msg.chat.id,
      '❌ Ошибка при загрузке файла.\n\n⏱️ *Это сообщение удалится через 100 секунд*',
      { parse_mode: 'Markdown' }
    );
  }
});

// ====================
// ПРИВЕТСТВИЕ НОВЫХ УЧАСТНИКОВ
// ====================
bot.on('new_chat_members', async (msg) => {
  if (msg.chat.id.toString() !== GROUP_CHAT_ID) return;

  msg.new_chat_members.forEach(async (member) => {
    // Пропускаем самого бота
    if (member.username === 'turbine_group_bot') return;

    setTimeout(async () => {
      const welcomeMessage = await bot.sendMessage(GROUP_CHAT_ID,
        `👋 Добро пожаловать в группу, *${member.first_name}*!\n\n` +
        `*Я бот-помощник этой группы.*\n\n` +
        `📋 *Мои функции:*\n` +
        `• Показывать графики работы 📅\n` +
        `• Хранить контакты сотрудников 👥\n` +
        `• Мониторить обороты турбины ⚙️\n\n` +
        `Нажмите /menu для основного меню!\n` +
        `*Приятного общения!*`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [
              ['📅 График текущего месяца'],
              ['🔄 График на цикл'],
              ['👥 Контакты сотрудников'],
              ['⚙️ Обороты турбины']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          }
        }
      );

      // Приветственное сообщение удаляем через 5 минут
      setTimeout(() => deleteMessage(GROUP_CHAT_ID, welcomeMessage.message_id), 300000);
    }, 1000);
  });
});

// ====================
// ОБРАБОТКА ОШИБОК
// ====================
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка polling:', error.code, error.message);

  if (error.code === 'EFATAL') {
    console.log('🔄 Перезапуск через 5 секунд...');
    setTimeout(() => {
      bot.startPolling();
    }, 5000);
  }
});

// ====================
// HTTP СЕРВЕР (для проверки)
// ====================
const app = express();
const PORT = process.env.PORT || 3001;

app.get('/', (req, res) => {
  res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>🤖 Турбинный Бот</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .status { background: #4CAF50; color: white; padding: 15px; border-radius: 8px; }
                .info { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0; }
                code { background: #eee; padding: 2px 5px; border-radius: 3px; }
            </style>
        </head>
        <body>
            <h1>🤖 Турбинный Бот для Telegram-группы</h1>
            <div class="status">
                <h2>✅ Бот активен и работает</h2>
                <p>Статус: <strong>ОНЛАЙН</strong></p>
            </div>
            <div class="info">
                <h3>📊 Статус системы:</h3>
                <p>🟢 Telegram Bot API: Подключено</p>
                <p>👥 ID группы: <code>${GROUP_CHAT_ID}</code></p>
                <p>⚙️ Активных мониторингов: ${activeTurbineTimers.size}</p>
                <p>📅 Время запуска: ${new Date().toLocaleString()}</p>
            </div>
            <div class="info">
                <h3>📁 Настройки автоудаления:</h3>
                <p>✅ Обычные ответы: 100 секунд</p>
                <p>✅ Мониторинг оборотов: 30 секунд</p>
                <p>✅ Приветствия: 5 минут</p>
                <p>✅ Сообщения пользователей: удаляются сразу</p>
            </div>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP сервер запущен: http://localhost:${PORT}`);
  console.log(`🤖 Бот готов к работе!`);
  console.log(`📱 ID группы: ${GROUP_CHAT_ID}`);
  console.log(`⏱️ Настройки автоудаления:`);
  console.log(`   📝 Обычные ответы: 100 секунд`);
  console.log(`   ⚙️ Мониторинг оборотов: 30 секунд`);
  console.log(`   👋 Приветствия: 5 минут`);
  console.log(`💡 Команды: /menu, /help, /turbine`);
  console.log(`🔧 Для обновления графиков отправьте фото с подписью`);
});

// Экспорт
module.exports = { bot };