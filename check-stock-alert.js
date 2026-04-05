// check-stock-alert.js
// 每天定時檢查庫存，低於設定時發送 Telegram 通知

const https = require('https');
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

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

async function initializeFirebase() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  if (credPath && fs.existsSync(credPath)) {
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    initializeApp({
      credential: cert(creds)
    });
    console.log('Firebase 以服務帳號初始化');
  } else {
    // 作為最後手段，使用 Application Default Credentials
    initializeApp();
    console.log('Firebase 以 ADC 初始化');
  }
}

async function checkStockAlerts() {
  console.log('開始檢查庫存...');
  console.log('TIME:', new Date().toISOString());

  await initializeFirebase();
  const db = getFirestore();

  const today = new Date().toISOString().split('T')[0];
  const alerts = [];
  const stores = ['總店', '麥金店'];

  for (const store of stores) {
    const docId = `${store}_${today}`;
    console.log(`檢查 ${store}...`);
    
    try {
      const doc = await db.collection('stock').doc(docId).get();
      if (doc.exists) {
        const items = doc.data().items || {};
        const storeAlerts = checkStoreItems(store, items);
        alerts.push(...storeAlerts);
        console.log(`  ${store}: 讀取成功, ${storeAlerts.length} 項低庫存`);
      } else {
        console.log(`  ${store}: 今日尚無資料`);
      }
    } catch (e) {
      console.error(`  ${store} 讀取錯誤:`, e.message);
    }
  }

  // 發送通知
  if (alerts.length > 0) {
    const message = `🔔 鮮樂炸雞 低庫存警示\n${'═'.repeat(20)}\n\n` +
      alerts.map(a => `⚠️ ${a.store} ${a.name}\n   庫存: ${a.current}${a.unit}\n   建議進: ${a.order}${a.unit}\n`).join('\n') +
      `\n${'═'.repeat(20)}\n📱 鮮樂炸雞 庫存系統`;

    console.log('發送通知:', alerts.length, '項警示');
    try {
      await sendTelegram(message);
      console.log('✅ 通知已發送！');
    } catch (e) {
      console.error('發送失敗:', e.message);
    }
  } else {
    console.log('✅ 今日無低庫存品項');
  }
}

function checkStoreItems(store, items) {
  const alerts = [];
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
  return alerts;
}

// 執行
checkStockAlerts().catch(e => {
  console.error('執行錯誤:', e.message);
  process.exit(1);
});
