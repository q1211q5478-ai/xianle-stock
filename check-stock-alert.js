// check-stock-alert.js
// 每天定時檢查庫存，低於設定時發送 Telegram 通知

const https = require('https');

const TELEGRAM_BOT_TOKEN = '8650605122:AAEoPf9Omf5_sLk1B_jSkF01SW6GJPPZr6Y';
const TELEGRAM_CHAT_ID = '8614627016';

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

async function checkStockAlerts() {
  // 動態 import firebase-admin（只在 GitHub Actions 環境用）
  let db;
  try {
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    
    initializeApp({
      credential: cert({
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
      })
    });
    db = getFirestore();
  } catch (e) {
    console.log('Firebase Admin not available, using mock mode');
  }

  const today = new Date().toISOString().split('T')[0];
  const alerts = [];

  const stores = ['總店', '麥金店'];

  for (const store of stores) {
    const docId = `${store}_${today}`;
    
    if (db) {
      try {
        const doc = await db.collection('stock').doc(docId).get();
        if (doc.exists) {
          const items = doc.data().items || {};
          checkStoreItems(store, items, alerts);
        }
      } catch (e) {
        console.error(`Error reading ${store}:`, e.message);
      }
    }
  }

  // 發送通知
  if (alerts.length > 0) {
    const message = `🔔 鮮樂炸雞 低庫存警示\n${'='.repeat(20)}\n\n` +
      alerts.map(a => `⚠️ ${a.store} ${a.name}\n   庫存: ${a.current}${a.unit}\n   建議進: ${a.order}${a.unit}\n`).join('\n') +
      `\n${'='.repeat(20)}\n📱 鮮樂炸雞 庫存系統`;

    console.log('Sending alert:', message);
    await sendTelegram(message);
    console.log('Alert sent!');
  } else {
    console.log('No alerts today');
  }
}

function checkStoreItems(store, items, alerts) {
  for (const [id, threshold] of Object.entries(THRESHOLDS)) {
    const current = items[id];
    if (current !== undefined && current < threshold.low) {
      alerts.push({
        store,
        name: threshold.name,
        current,
        order: threshold.order,
        unit: threshold.unit
      });
    }
  }
}

// 模擬模式測試
async function mockMode() {
  console.log('Running mock alert check...');
  const mockItems = {
    D001: 5,  // 雞腿低於10
    D005: 2,  // 薯條低於5
    W001: 3,  // 魚蹟低於5
  };
  const alerts = [];
  checkStoreItems('總店', mockItems, alerts);
  if (alerts.length > 0) {
    console.log('Alerts found:', alerts);
  } else {
    console.log('No alerts');
  }
}

// 執行
const args = process.argv.slice(2);
if (args.includes('--mock')) {
  mockMode();
} else {
  checkStockAlerts().catch(console.error);
}

module.exports = { checkStockAlerts, checkStoreItems };
