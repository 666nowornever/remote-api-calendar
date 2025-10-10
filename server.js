import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CORS для всех доменов (важно для Telegram Mini Apps)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, 'data', 'calendar-data.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DATA_FILE))) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
        events: {},
        vacations: {},
        lastModified: Date.now(),
        version: 1
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    console.log('📁 Created initial data file');
}

// Store connected clients
const clients = new Set();

// Load calendar data
function loadData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ Error loading data:', error);
        return { events: {}, vacations: {}, lastModified: Date.now(), version: 1 };
    }
}

// Save calendar data
function saveData(data) {
    try {
        data.lastModified = Date.now();
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('💾 Data saved successfully');
        return data.lastModified;
    } catch (error) {
        console.error('❌ Error saving data:', error);
        throw error;
    }
}

// Broadcast to all clients except sender
function broadcast(data, excludeClient = null) {
    let count = 0;
    clients.forEach(client => {
        if (client !== excludeClient && client.readyState === 1) {
            client.send(JSON.stringify(data));
            count++;
        }
    });
    console.log(`📤 Broadcasted to ${count} clients`);
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        clients: clients.size,
        version: '1.0.0'
    });
});

// Get calendar data
app.get('/api/calendar', (req, res) => {
    try {
        const data = loadData();
        res.json({
            success: true,
            data: data,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('❌ API Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to read data' 
        });
    }
});

// Update calendar data
app.post('/api/calendar', (req, res) => {
    try {
        const newData = req.body;
        
        if (!newData || typeof newData !== 'object') {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid data format' 
            });
        }

        const lastModified = saveData(newData);
        
        // Broadcast changes to all WebSocket clients
        broadcast({
            type: 'DATA_UPDATE',
            data: newData,
            source: 'http',
            timestamp: Date.now()
        });
        
        res.json({ 
            success: true, 
            lastModified,
            message: 'Data updated successfully'
        });
        
    } catch (error) {
        console.error('❌ API Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save data' 
        });
    }
});

// Create HTTP server
const server = app.listen(PORT, () => {
    console.log(`🚀 Remote API Calendar Server running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 API: http://localhost:${PORT}/api/calendar`);
});

// WebSocket server
const wss = new WebSocketServer({ 
    server,
    path: '/ws'
});

wss.on('connection', (ws, req) => {
    console.log('🔗 New WebSocket client connected');
    clients.add(ws);

    // Send current data to new client
    const currentData = loadData();
    ws.send(JSON.stringify({
        type: 'INIT_DATA',
        data: currentData,
        timestamp: Date.now()
    }));

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message);
            console.log('📨 Received WebSocket message:', parsed.type);

            switch (parsed.type) {
                case 'DATA_UPDATE':
                    // Validate data
                    if (!parsed.data || typeof parsed.data !== 'object') {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: 'Invalid data format'
                        }));
                        return;
                    }

                    // Save data
                    const lastModified = saveData(parsed.data);
                    
                    // Broadcast to all other clients
                    broadcast({
                        type: 'DATA_UPDATE',
                        data: parsed.data,
                        source: 'client',
                        timestamp: Date.now()
                    }, ws);
                    
                    // Confirm to sender
                    ws.send(JSON.stringify({
                        type: 'UPDATE_CONFIRMED',
                        lastModified,
                        timestamp: Date.now()
                    }));
                    break;

                case 'PING':
                    ws.send(JSON.stringify({ type: 'PONG' }));
                    break;

                default:
                    console.log('Unknown message type:', parsed.type);
            }
        } catch (error) {
            console.error('❌ Error processing WebSocket message:', error);
            ws.send(JSON.stringify({
                type: 'ERROR',
                message: 'Invalid message format'
            }));
        }
    });

    ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
        clients.delete(ws);
        console.log(`👥 Remaining clients: ${clients.size}`);
    });

    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        clients.delete(ws);
    });
});

// Heartbeat to keep connections alive
setInterval(() => {
    const heartbeatData = {
        type: 'HEARTBEAT',
        timestamp: Date.now(),
        clients: clients.size
    };
    
    clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify(heartbeatData));
        }
    });
}, 30000); // Every 30 seconds

// Clean up dead connections
setInterval(() => {
    clients.forEach(client => {
        if (client.readyState === 2 || client.readyState === 3) {
            clients.delete(client);
        }
    });
}, 60000); // Every minute

console.log('✅ WebSocket server initialized');