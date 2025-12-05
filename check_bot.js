const TelegramBot = require('node-telegram-bot-api');

const TOKEN = '8533299703:AAGxj_5pjBFrmuYQnXwMROQF6MQ7ePPezDM';

console.log('🔍 Проверяю статус бота...\n');

try {
  const bot = new TelegramBot(TOKEN);

  // Пробуем получить информацию о боте
  bot.getMe().then(me => {
    console.log('✅ Бот активен и подключен!');
    console.log('🤖 Имя бота:', me.first_name);
    console.log('👤 Username:', me.username);
    console.log('🆔 ID бота:', me.id);
    console.log('\n📱 Проверка Webhook/Polling:');
    console.log('- Polling по умолчанию включен');
    console.log('- Бот должен получать сообщения');

    // Пробуем отправить тестовое сообщение себе
    bot.sendMessage(me.id, '✅ Бот работает! Проверка связи.').then(() => {
      console.log('\n✅ Тестовое сообщение отправлено боту!');
      console.log('\n🚀 Проблема не в боте. Проверьте:');
      console.log('1. Бот добавлен в группу?');
      console.log('2. У бота отключен режим приватности? (/setprivacy в @BotFather)');
      console.log('3. ID группы правильный в .env файле?');
      process.exit(0);
    }).catch(err => {
      console.error('❌ Ошибка отправки сообщения:', err.message);
      process.exit(1);
    });
  }).catch(err => {
    console.error('❌ Ошибка подключения к боту:', err.message);
    console.log('\n⚠️ Возможные причины:');
    console.log('1. Неправильный токен');
    console.log('2. Бот заблокирован в @BotFather');
    console.log('3. Проблемы с интернетом');
    process.exit(1);
  });
} catch (error) {
  console.error('❌ Критическая ошибка:', error.message);
  process.exit(1);
}