const TelegramBot = require('node-telegram-bot-api');

// Ваш токен
const TOKEN = '8533299703:AAGxj_5pjBFrmuYQnXwMROQF6MQ7ePPezDM';

console.log('🚀 Запускаю бота для получения ID группы...');
console.log('🤖 Токен бота:', TOKEN.substring(0, 10) + '...');
console.log('\n📋 ИНСТРУКЦИЯ:');
console.log('1. Добавьте бота в вашу группу');
console.log('2. Напишите ЛЮБОЕ сообщение в группе');
console.log('3. ID появится здесь автоматически');
console.log('='.repeat(50));

const bot = new TelegramBot(TOKEN, {
  polling: {
    interval: 1000,
    timeout: 10,
    autoStart: true
  }
});

bot.on('message', (msg) => {
  console.log('\n' + '='.repeat(50));
  console.log('✅ СООБЩЕНИЕ ПОЛУЧЕНО!');
  console.log('='.repeat(50));

  console.log('\n📋 ИНФОРМАЦИЯ О ЧАТЕ:');
  console.log('├ Тип чата:', msg.chat.type);
  console.log('├ Название:', msg.chat.title || 'Личный чат');
  console.log(`├ ID чата: ${msg.chat.id} (скопируйте это значение!)`);
  console.log('├ Username:', msg.chat.username || 'нет');

  console.log('\n👤 ИНФОРМАЦИЯ ОТПРАВИТЕЛЯ:');
  console.log('├ Имя:', msg.from.first_name);
  console.log('├ Username:', msg.from.username || 'нет');
  console.log(`├ ID отправителя: ${msg.from.id} (это ваш ADMIN_ID)`);

  console.log('\n💭 Текст сообщения:', msg.text || '(без текста)');
  console.log('\n' + '='.repeat(50));

  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    console.log('\n🎉 УСПЕХ! ID группы получен:');
    console.log(`📌 GROUP_CHAT_ID = ${msg.chat.id}`);
    console.log(`📌 ADMIN_ID = ${msg.from.id}`);

    console.log('\n📝 Копируйте эти значения в .env файл:');
    console.log('GROUP_CHAT_ID=' + msg.chat.id);
    console.log('ADMIN_ID=' + msg.from.id);

    // Автоматически создаем обновленный .env файл
    const fs = require('fs');
    const envContent = `TELEGRAM_BOT_TOKEN=8533299703:AAGxj_5pjBFrmuYQnXwMROQF6MQ7ePPezDM\nGROUP_CHAT_ID=${msg.chat.id}\nADMIN_ID=${msg.from.id}`;

    fs.writeFileSync('.env', envContent);
    console.log('\n✅ .env файл автоматически обновлен!');

    console.log('\n🚀 Теперь запустите основного бота:');
    console.log('npm start');

    // Останавливаем этот скрипт через 10 секунд
    setTimeout(() => {
      console.log('\n🛑 Скрипт завершен. Запускайте основного бота.');
      process.exit(0);
    }, 10000);
  } else {
    console.log('\n⚠️ Это не группа! Перейдите в группу и напишите там.');
  }
});

bot.on('new_chat_members', (msg) => {
  console.log('\n🎉 Бота добавили в новый чат!');
  console.log('Название:', msg.chat.title);
  console.log('ID:', msg.chat.id);
});

bot.on('polling_error', (error) => {
  if (error.code === 'EFATAL') {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:');
    console.error('1. Проверьте токен бота');
    console.error('2. Убедитесь, что бот активен в @BotFather');
    console.error('3. Проверьте интернет-соединение');
    process.exit(1);
  }
});

console.log('\n⏳ Ожидаю сообщение из группы...');
console.log('(Напишите что-нибудь в группе, куда добавили бота)');