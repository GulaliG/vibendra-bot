require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const ytSearch = require('yt-search');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const downloadsDir = path.join(os.tmpdir(), 'vibendra_downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

let lastResults = {};

// 🔰 Selamlama Mesajı
bot.onText(/\/start/, (msg) => {
    const name = msg.from.first_name || '';
    const welcome = `
<b>🎶 Merhaba ${name}!</b>

Ben <b>Vibendra</b> — senin kişisel müzik asistanın.
Şarkı ismini yaz.
Tıkladığında MP3 olarak DM'den gönderirim.

<b>Hazırlayan: Gulaliden Pingvittoya</b>
`;
    bot.sendMessage(msg.chat.id, welcome, { parse_mode: 'HTML' });
});

// 🔍 Arama
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const query = msg.text.trim();

    if (msg.text.startsWith('/')) return;

    bot.sendMessage(chatId, `🔎 <b>"${query}"</b> aranıyor...`, { parse_mode: 'HTML' });

    const res = await ytSearch(query);
    const videos = res.videos.slice(0, 5);

    if (!videos.length) {
        return bot.sendMessage(chatId, `❌ <b>"${query}" için şarkı bulunamadı.</b>`, { parse_mode: 'HTML' });
    }

    lastResults[chatId] = videos;

    const buttons = videos.map((v, i) => [
        {
            text: `🎧 ${v.timestamp} • ${v.title} — ${v.author.name}`,
            callback_data: `download_${i}`,
        },
    ]);

    bot.sendMessage(chatId, `📝 <b>Seçmek için bir parça tıkla:</b>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
    });
});

// 🎵 İndirme & DM Gönderme
bot.on('callback_query', async (query) => {
    const msg = query.message;
    const chatId = msg.chat.id;
    const userId = query.from.id;
    const data = query.data;

    if (!data.startsWith('download_')) return;

    const index = parseInt(data.split('_')[1]);
    const video = lastResults[chatId]?.[index];

    if (!video) return bot.sendMessage(chatId, '⚠️ Geçersiz seçim.');

    const url = video.url;
    const title = video.title.replace(/[^\w\s]/gi, '');
    const safeTitle = title.substring(0, 50).replace(/\s+/g, '_');
    const outputPath = path.join(downloadsDir, `${safeTitle}_${userId}.mp3`);

    bot.sendMessage(chatId, `📡 <b>"${video.title}" indiriliyor...</b>\n📬 Şarkı özel mesajla gönderilecek.`, { parse_mode: 'HTML' });

    const command = `yt-dlp -f bestaudio --extract-audio --audio-format mp3 -o "${outputPath}" "${url}"`;

    exec(command, async (error, stdout, stderr) => {
        if (error) {
            console.error("YTDLP Error:", stderr);
            bot.sendMessage(chatId, '❌ Şarkı indirilemedi.');
            return;
        }

        try {
            await bot.sendAudio(userId, outputPath, {
                caption: `🎶 ${video.title}`,
            });
            fs.unlinkSync(outputPath);
        } catch (err) {
            console.error("Send Error:", err);
            bot.sendMessage(chatId, '❌ DM gönderimi başarısız.');
        }
    });
});
