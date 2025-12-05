console.log('🔍 Тестирую чтение контактов...');

const fs = require('fs').promises;
const path = require('path');

async function testContacts() {
  try {
    // Проверяем путь
    const contactsPath = path.join(__dirname, 'data', 'contacts.json');
    console.log('📁 Путь к файлу:', contactsPath);

    // Проверяем существование
    await fs.access(contactsPath);
    console.log('✅ Файл существует');

    // Читаем файл
    const data = await fs.readFile(contactsPath, 'utf8');
    console.log('✅ Файл прочитан');
    console.log('📊 Размер данных:', data.length, 'символов');

    // Парсим JSON
    const contacts = JSON.parse(data);
    console.log('✅ JSON парсится корректно');
    console.log('👥 Количество контактов:', contacts.length);

    // Показываем первый контакт
    if (contacts.length > 0) {
      console.log('\n📋 Первый контакт:');
      console.log('Имя:', contacts[0].name);
      console.log('Должность:', contacts[0].position);
      console.log('Телефон:', contacts[0].phone);
    }

    console.log('\n🎯 Все готово для работы бота!');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);

    if (error.code === 'ENOENT') {
      console.log('\n📝 Создаю пример файла contacts.json...');

      const exampleContacts = [
        {
          "name": "Тестовый Сотрудник",
          "position": "Тестовая должность",
          "phone": "+7 (999) 000-00-00",
          "shift": "Тестовая смена",
          "email": "test@example.com"
        }
      ];

      // Создаем папку data если нет
      try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
      } catch (mkdirError) {
        // Папка уже существует
      }

      // Создаем файл
      await fs.writeFile(
        path.join(__dirname, 'data', 'contacts.json'),
        JSON.stringify(exampleContacts, null, 2)
      );

      console.log('✅ Файл создан. Перезапустите бота.');
    }
  }
}

testContacts();