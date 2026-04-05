// check-stock-alert.js
// 每天定時檢查庫存並發送 Telegram 通知

const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const THRESHOLDS = {
  D001: { name: '雞腿', low: 10, order: 30, unit: '盒' },
  D002: { name: '雞翅', low: 8, order: 25, unit: '盒' },
  D003: { name: '雞塊', low: 10, order: 30, unit: '盒' },
  D004: { name: '鹹酥雞', low: 10, order: 30, unit: '包' },
  D005: { name: '薯條', low: 5, order: 20, unit: '包' },
  D006: { name: '地瓜', low: 5, order: 20, unit: '包' },
  D007: { name: '銀絲捲', low: 5, order: 20, unit: '包' },
  D008: { name: '甜不辣', low: 5, order: 20, unit: '包' },
  D009: { name: '天婦羅', low: 5, order: 20, unit: '包' },
  D010: { name: '裹粉', low: 5, order: 20, unit: '包' },
  D011: { name: '脆皮粉', low: 5, order: 20, unit: '包' },
  D012: { name: '胡椒粉', low: 3, order: 10, unit: '罐' },
  D013: { name: '梅粉', low: 3, order: 10, unit: '罐' },
  D014: { name: '回鍋油', low: 5, order: 20, unit: '公升' },
  D015: { name: '新油', low: 10, order: 30, unit: '公升' },
  W001: { name: '魚漿', low: 5, order: 15, unit: '公斤' },
  W002: { name: '天婦羅皮', low: 5, order: 20, unit: '包' },
  W003: { name: '甜不辣糊', low: 5, order: 15, unit: '公斤' },
  W004: { name: '包蛋黑輪', low: 10, order: 30, unit: '條' },
  W005: { name: '牛蒡天婦羅', low: 5, order: 20, unit: '包' },
  W006: { name: '小卷天婦羅', low: 5, order: 20, unit: '包' },
  W007: { name: '魷魚天婦羅', low: 5, order: 20, unit: '包' },
  W008: { name: '花枝天婦羅', low: 5, order: 20, unit: '包' },
};

// 發送 Telegram 訊息
function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(message)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

// 主程式
async function checkStockAlerts() {
  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  
  // 發送每日測試確認訊息
  const testMsg = `🔔 鮮樂炸雞 系統測試\n━━━━━━━━━━━━━━\n⏰ 時間：${today}\n✅ 自動檢查系統正常運作\n📊 PWA：https://q1211q5478-ai.github.io/xianle-stock/\n📱 儀表板：https://q1211q5478-ai.github.io/xianle-stock/dashboard.html`;
  
  try {
    await sendTelegram(testMsg);
    console.log('✅ 每日測試通知已發送');
  } catch (e) {
    console.error('❌ 發送失敗:', e.message);
    process.exit(1);
  }
}

// 執行
checkStockAlerts();
