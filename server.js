// remote-api-calendar/server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data/calendar-data.json');

// Middleware
app.use(cors());
app.use(express.json());

// Инициализация файла данных
async function initDataFile() {
    try {
        await fs.access(DATA_FILE);
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

// Получить данные календаря
app.get('/api/calendar', async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const calendarData = JSON.parse(data);
        
        res.json({
            success: true,
            data: calendarData,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('❌ Ошибка чтения данных:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка чтения данных'
        });
    }
});

// Сохранить данные календаря
app.post('/api/calendar', async (req, res) => {
    try {
        const newData = req.body;
        
        // Валидация данных
        if (!newData || typeof newData !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Неверный формат данных'
            });
        }
        
        // Обновляем метку времени
        newData.lastModified = Date.now();
        
        // Сохраняем в файл
        await fs.writeFile(DATA_FILE, JSON.stringify(newData, null, 2));
        
        console.log('💾 Данные сохранены:', {
            events: Object.keys(newData.events || {}).length,
            vacations: Object.keys(newData.vacations || {}).length,
            lastModified: new Date(newData.lastModified).toLocaleString()
        });
        
        res.json({
            success: true,
            lastModified: newData.lastModified,
            version: (newData.version || 0) + 1,
            message: 'Данные успешно сохранены'
        });
    } catch (error) {
        console.error('❌ Ошибка сохранения данных:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка сохранения данных'
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        timestamp: Date.now(),
        service: 'Calendar API'
    });
});

// Получить статистику
app.get('/api/stats', async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const calendarData = JSON.parse(data);
        
        res.json({
            success: true,
            stats: {
                totalEvents: Object.keys(calendarData.events || {}).length,
                totalVacations: Object.keys(calendarData.vacations || {}).length,
                lastModified: calendarData.lastModified,
                version: calendarData.version
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Запуск сервера
async function startServer() {
    await initDataFile();
    
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`📊 API доступен по адресу: http://localhost:${PORT}`);
        console.log('📁 Файл данных:', DATA_FILE);
    });
}

startServer();