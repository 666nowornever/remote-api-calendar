const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data/calendar-data.json');

// Получаем домен из переменной окружения или используем по умолчанию
const ALLOWED_ORIGINS = [
    'https://666nowornever.github.io',      // Ваш конкретный GitHub Pages
    'https://web.telegram.org',             // Telegram Web
    'https://telegram.org',                 // Telegram
    'http://localhost:3000',                // Локальная разработка
    'http://localhost:5173',                // Vite dev server
    'https://*.github.io',                  // Все GitHub Pages
    'https://*.render.com',                 // Render
    'https://*.telegram.org'                // Все поддомены Telegram
];

// Middleware для логирования всех запросов
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    console.log('Origin:', req.headers.origin);
    console.log('User-Agent:', req.headers['user-agent']);
    next();
});

// Middleware для обработки CORS
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    // Проверяем, разрешен ли origin
    const isAllowed = ALLOWED_ORIGINS.some(allowed => {
        if (allowed.includes('*')) {
            const regex = new RegExp('^' + allowed.replace('*', '.*') + '$');
            return regex.test(origin);
        }
        return origin === allowed;
    });
    
    if (isAllowed && origin) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Telegram-Init-Data');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type, X-Request-Id');
    res.header('Access-Control-Max-Age', '86400'); // 24 часа
    
    next();
});

// Обработчик для OPTIONS запросов (preflight)
app.options('*', (req, res) => {
    console.log('🛫 Preflight request received');
    res.status(200).end();
});

// Основное middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Инициализация файла данных
async function initDataFile() {
    try {
        await fs.access(DATA_FILE);
        console.log('📁 Файл данных существует');
    } catch (error) {
        const initialData = {
            events: {},
            vacations: {},
            lastModified: Date.now(),
            version: 1
        };
        await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('📁 Файл данных создан');
    }
}

// Health check - должен быть ПЕРВЫМ после middleware
app.get('/api/health', (req, res) => {
    console.log('❤️ GET /api/health - Health check');
    res.json({
        success: true,
        status: 'ok',
        timestamp: Date.now(),
        service: 'Calendar API',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        origin: req.headers.origin || 'No origin header'
    });
});

// Получить данные календаря
app.get('/api/calendar', async (req, res) => {
    try {
        console.log('📥 GET /api/calendar');
        
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const calendarData = JSON.parse(data);
        
        console.log(`📊 Возвращаю данные: ${Object.keys(calendarData.events).length} дежурств, ${Object.keys(calendarData.vacations).length} отпусков`);
        
        res.json({
            success: true,
            data: calendarData,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('❌ Ошибка чтения данных:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка чтения данных',
            details: error.message
        });
    }
});

// Сохранить данные календаря
app.post('/api/calendar', async (req, res) => {
    try {
        console.log('📤 POST /api/calendar');
        
        const newData = req.body;
        
        // Валидация данных
        if (!newData || typeof newData !== 'object') {
            console.error('❌ Неверный формат данных');
            return res.status(400).json({
                success: false,
                error: 'Неверный формат данных'
            });
        }
        
        // Проверяем обязательные поля
        if (typeof newData.events !== 'object' || typeof newData.vacations !== 'object') {
            console.error('❌ Отсутствуют обязательные поля');
            return res.status(400).json({
                success: false,
                error: 'Отсутствуют обязательные поля events и vacations'
            });
        }
        
        // Обновляем метку времени
        newData.lastModified = Date.now();
        
        // Если версия не передана, увеличиваем на 1
        if (typeof newData.version !== 'number') {
            newData.version = 1;
        } else {
            newData.version += 1;
        }
        
        // Сохраняем в файл
        await fs.writeFile(DATA_FILE, JSON.stringify(newData, null, 2));
        
        console.log('💾 Данные сохранены:', {
            events: Object.keys(newData.events || {}).length,
            vacations: Object.keys(newData.vacations || {}).length,
            lastModified: new Date(newData.lastModified).toLocaleString('ru-RU'),
            version: newData.version
        });
        
        res.json({
            success: true,
            lastModified: newData.lastModified,
            version: newData.version,
            message: 'Данные успешно сохранены',
            received: {
                events: Object.keys(newData.events).length,
                vacations: Object.keys(newData.vacations).length
            }
        });
    } catch (error) {
        console.error('❌ Ошибка сохранения данных:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка сохранения данных',
            details: error.message
        });
    }
});

// Получить статистику
app.get('/api/stats', async (req, res) => {
    try {
        console.log('📊 GET /api/stats');
        
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const calendarData = JSON.parse(data);
        
        const stats = {
            totalEvents: Object.keys(calendarData.events || {}).length,
            totalVacations: Object.keys(calendarData.vacations || {}).length,
            lastModified: calendarData.lastModified,
            version: calendarData.version,
            fileSize: Buffer.byteLength(data, 'utf8')
        };
        
        console.log('📈 Статистика:', stats);
        
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Тестовый endpoint для проверки CORS
app.get('/api/test-cors', (req, res) => {
    console.log('🧪 GET /api/test-cors');
    res.json({
        success: true,
        message: 'CORS работает корректно!',
        timestamp: Date.now(),
        yourOrigin: req.headers.origin || 'No origin',
        allowedOrigins: ALLOWED_ORIGINS,
        headers: req.headers
    });
});

// Простой тест без CORS проверки
app.get('/api/ping', (req, res) => {
    console.log('🏓 GET /api/ping');
    res.json({
        success: true,
        message: 'pong',
        timestamp: Date.now()
    });
});

// Обработка 404
app.use('*', (req, res) => {
    console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('💥 Ошибка сервера:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Запуск сервера
async function startServer() {
    try {
        await initDataFile();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Сервер запущен на порту ${PORT}`);
            console.log(`📊 API доступен по адресу: http://0.0.0.0:${PORT}`);
            console.log(`🌐 Внешний URL: https://remote-api-calendar.onrender.com`);
            console.log(`📁 Файл данных: ${DATA_FILE}`);
            console.log('🔧 CORS настроен для:');
            ALLOWED_ORIGINS.forEach(origin => console.log(`  • ${origin}`));
            console.log('\n📋 Доступные endpoints:');
            console.log(`  • GET  /api/health     - Проверка работы сервера`);
            console.log(`  • GET  /api/calendar   - Получить данные календаря`);
            console.log(`  • POST /api/calendar   - Сохранить данные календаря`);
            console.log(`  • GET  /api/stats      - Статистика`);
            console.log(`  • GET  /api/test-cors  - Тест CORS`);
            console.log(`  • GET  /api/ping       - Простой пинг`);
        });
    } catch (error) {
        console.error('💥 Не удалось запустить сервер:', error);
        process.exit(1);
    }
}

startServer();