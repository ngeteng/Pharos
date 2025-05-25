require('dotenv').config();
const axios = require('axios');

const reportToTelegram = async (logger, walletAddress, userInfo) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        const warnMsg = "⚠️  TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Skipping report.";
        if (logger && logger.warn) {
            logger.warn(warnMsg);
        } else {
            console.warn(warnMsg);
        }
        return;
    }

    const message = `
🤖 *Pharos Bot Report* 🤖
-------------------------
**Alamat Wallet:** \`${walletAddress}\`
**User ID:** ${userInfo.ID || 'N/A'}
**Task Points:** ${userInfo.TaskPoints !== undefined ? userInfo.TaskPoints : 'N/A'}
**Total Points:** ${userInfo.TotalPoints !== undefined ? userInfo.TotalPoints : 'N/A'}
-------------------------
*Waktu:* ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
    `;

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });
        const successMsg = "📢 Laporan berhasil dikirim ke Telegram!";
        if (logger && logger.info) {
            logger.info(successMsg);
        } else {
            console.log(successMsg);
        }
    } catch (error) {
        let errorMsg;
        if (error.response) {
            errorMsg = `❌ Gagal mengirim laporan Telegram: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
        } else {
            errorMsg = `❌ Gagal mengirim laporan Telegram: ${error.message}`;
        }
        if (logger && logger.error) {
            logger.error(errorMsg);
        } else {
            console.error(errorMsg);
        }
    }
};

module.exports = {
    reportToTelegram
};
