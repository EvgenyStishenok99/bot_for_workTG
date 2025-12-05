console.log('🚀 Запускаю ПРОСТОЙ бота...');

const TelegramBot = require('node-telegram-bot-api');

// Ваш токен
const TOKEN = '8533299703:AAGxj_5pjBFrmuYQnXwMROQF6MQ7ePPezDM';

// Создаем бота с явными настройками
const bot = new TelegramBot(TOKEN, {
  polling: {
    interval: 1000,
    timeout: 60,
    autoStart: true,
    params: {
      timeout: 60,
      limit: 100
    }
  },
  request: {
    timeout: 60000
  }
});

// Проверяем подключение
bot.getMe()
  .then(me => {
    console.log('✅ Бот подключен!');
    console.log(`🤖 Имя: ${me.first_name}`);
    console.log(`👤 Username: @${me.username}`);
    console.log(`🆔 ID: ${me.id}`);
    console.log('\n🎯 Бот готов к работе!');
    console.log('📱 Напишите /test в Telegram');
  })
  .catch(err => {
    console.error('❌ Ошибка подключения:', err.message);
    console.log('\n⚠️ Проверьте:');
    console.log('1. Интернет соединение');
    console.log('2. Токен бота');
    console.log('3. Бот не заблокирован');
    process.exit(1);
  });

// Простейшая команда
bot.onText(/\/test/, (msg) => {
  console.log(`📨 Получен /test от ${msg.from.first_name}`);
  bot.sendMessage(msg.chat.id, `✅ Тест пройден! Бот работает.`);
});

// Контакты
bot.onText(/\/contacts/, async (msg) => {
  console.log(`📞 Запрос контактов от ${msg.from.first_name}`);

  try {
    const fs = require('fs').promises;
    const path = require('path');
    const contactsFile = path.join(__dirname, 'data', 'contacts.json');

    // Читаем файл
    const data = await fs.readFile(contactsFile, 'utf8');
    const contacts = JSON.parse(data);

    let message = `📞 Контакты (${contacts.length} чел.):\n\n`;

    contacts.forEach((contact, i) => {
      message += `${i+1}. ${contact.name}\n`;
      message += `   📱 ${contact.phone}\n`;
      message += `   🏢 ${contact.position}\n\n`;
    });

    await bot.sendMessage(msg.chat.id, message);
    console.log(`✅ Контакты отправлены`);

  } catch (error) {
    console.error('❌ Ошибка контактов:', error.message);
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${error.message}`);
  }
});

// Обороты турбины
bot.onText(/\/turbine/, (msg) => {
  const rpm = Math.floor(Math.random() * (6960 - 6896 + 1)) + 6896;
  bot.sendMessage(msg.chat.id, `⚙️ Обороты: ${rpm} об/мин`);
});

// Логируем ВСЕ сообщения
bot.on('message', (msg) => {
  console.log(`💬 ${msg.from.first_name}: ${msg.text || '(без текста)'}`);
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.code, error.message);

  if (error.code === 409) {
    console.log('\n⚠️ ЗАПУЩЕНО НЕСКОЛЬКО БОТОВ!');
    console.log('Выполните:');
    console.log('1. Ctrl+C в этом окне');
    console.log('2. pkill -9 node');
    console.log('3. Запустите заново');
  }
});

console.log('\n⏳ Ожидаю сообщения...');
console.log('💡 Команды: /test, /contacts, /turbine');