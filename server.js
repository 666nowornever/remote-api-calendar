const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data/calendar-data.json');

// Разрешенные origin'ы
const ALLOWED_ORIGINS = [
    'https://666nowornever.github.io',
    'https://web.telegram.org',
    'https://telegram.org',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080'
];

// Middleware для обработки CORS
const corsMiddleware = (req, res, next) => {
    const origin = req.headers.origin;
    
    // Разрешаем все origins в development, в production - только разрешенные
    if (process.env.NODE_ENV === 'development' || 
        !origin || 
        ALLOWED_ORIGINS.includes(origin) ||
        origin.includes('github.io') ||
        origin.includes('telegram.org')) {
        
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', 86400); // 24 часа
    }
    
    // Для OPTIONS запросов сразу отвечаем
    if (req.method === 'OPTIONS') {
        console.log('🛫 OPTIONS (preflight) запрос обработан');
        return res.status(200).end();
    }
    
    next();
};

// Применяем middleware
app.use(corsMiddleware);
app.use(express.json());

// Логирование запросов
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} | Origin: ${req.headers.origin || 'none'}`);
    next();
});

// Инициализация файла данных
async function initDataFile() {
    try {
        await fs.access(DATA_FILE);
        console.log('✅ Файл данных существует');
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

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ Ошибка чтения файла:', error);
        throw error;
    }
}

async function writeData(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ Ошибка записи файла:', error);
        throw error;
    }
}

function validateCalendarData(data) {
    return data && 
           typeof data === 'object' &&
           typeof data.events === 'object' &&
           typeof data.vacations === 'object' &&
           typeof data.lastModified === 'number' &&
           typeof data.version === 'number';
}

// === РОУТЫ ===

// Простой пинг (без валидации CORS для тестов)
app.get('/api/ping', (req, res) => {
    console.log('🏓 Пинг запрос получен');
    res.json({
        success: true,
        message: 'pong',
        timestamp: Date.now(),
        service: 'Calendar API',
        origin: req.headers.origin || 'none'
    });
});

// Health check
app.get('/api/health', (req, res) => {
    console.log('❤️ Health check');
    res.json({
        success: true,
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Получить данные календаря
app.get('/api/calendar', async (req, res) => {
    try {
        console.log('📥 GET /api/calendar');
        const data = await readData();
        
        res.json({
            success: true,
            data: data,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('❌ Ошибка получения данных:', error);
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
        
        if (!validateCalendarData(newData)) {
            return res.status(400).json({
                success: false,
                error: 'Неверный формат данных'
            });
        }
        
        // Обновляем timestamp и версию
        newData.lastModified = Date.now();
        newData.version = (newData.version || 0) + 1;
        
        await writeData(newData);
        
        console.log(`💾 Данные сохранены. Версия: ${newData.version}`);
        
        res.json({
            success: true,
            lastModified: newData.lastModified,
            version: newData.version,
            message: 'Данные успешно сохранены'
        });
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
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
        const data = await readData();
        
        res.json({
            success: true,
            stats: {
                eventsCount: Object.keys(data.events || {}).length,
                vacationsCount: Object.keys(data.vacations || {}).length,
                lastModified: data.lastModified,
                version: data.version
            }
        });
    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения статистики'
        });
    }
});

// Тест CORS
app.get('/api/test-cors', (req, res) => {
    console.log('🧪 GET /api/test-cors');
    res.json({
        success: true,
        message: 'CORS работает!',
        timestamp: Date.now(),
        yourOrigin: req.headers.origin || 'не указан',
        allowedOrigins: ALLOWED_ORIGINS
    });
});

// Обработка 404
app.use((req, res) => {
    console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: 'Эндпоинт не найден',
        path: req.path
    });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('💥 Ошибка сервера:', err);
    res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера',
        message: err.message
    });
});

// Запуск сервера
async function startServer() {
    try {
        await initDataFile();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log('='.repeat(50));
            console.log(`🚀 Сервер запущен на порту ${PORT}`);
            console.log(`🌐 Внешний URL: https://remote-api-calendar.onrender.com`);
            console.log(`📁 Файл данных: ${DATA_FILE}`);
            console.log('\n📡 Разрешенные origins:');
            ALLOWED_ORIGINS.forEach(origin => console.log(`  • ${origin}`));
            console.log('\n🔌 Доступные эндпоинты:');
            console.log('  GET  /api/ping       - Проверка доступности');
            console.log('  GET  /api/health     - Проверка здоровья сервера');
            console.log('  GET  /api/calendar   - Получить данные календаря');
            console.log('  POST /api/calendar   - Сохранить данные календаря');
            console.log('  GET  /api/stats      - Получить статистику');
            console.log('  GET  /api/test-cors  - Тест CORS');
            console.log('='.repeat(50));
        });
    } catch (error) {
        console.error('💥 Не удалось запустить сервер:', error);
        process.exit(1);
    }
}

startServer();