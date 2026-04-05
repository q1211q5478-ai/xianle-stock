// check-stock-alert.js
// 補貨警示系統：根據安全庫存計算進貨建議

const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ========== 設定規則 ==========
const REORDER_DAYS = 3; // 備貨天數

// 安全庫存（低於此數量一定通知）
const SAFETY_STOCK = {
  // 每日品項
  D001: { name: '雞腿', safety: 20, unit: '盒' },
  D002: { name: '雞翅', safety: 20, unit: '盒' },
  D003: { name: '雞塊', safety: 15, unit: '盒' },
  D004: { name: '鹹酥雞', safety: 15, unit: '包' },
  D005: { name: '薯條', safety: 10, unit: '包' },
  D006: { name: '地瓜', safety: 10, unit: '包' },
  D007: { name: '銀絲捲', safety: 10, unit: '包' },
  D008: { name: '甜不辣', safety: 10, unit: '包' },
  D009: { name: '天婦羅', safety: 10, unit: '包' },
  D010: { name: '裹粉', safety: 10, unit: '包' },
  D011: { name: '脆皮粉', safety: 10, unit: '包' },
  D012: { name: '胡椒粉', safety: 5, unit: '罐' },
  D013: { name: '梅粉', safety: 5, unit: '罐' },
  D014: { name: '回鍋油', safety: 10, unit: '公升' },
  D015: { name: '新油', safety: 15, unit: '公升' },
  // 每週品項
  W001: { name: '魚漿', safety: 10, unit: '公斤' },
  W002: { name: '天婦羅皮', safety: 10, unit: '包' },
  W003: { name: '甜不辣糊', safety: 10, unit: '公斤' },
  W004: { name: '包蛋黑輪', safety: 15, unit: '條' },
  W005: { name: '牛蒡天婦羅', safety: 10, unit: '包' },
  W006: { name: '小卷天婦羅', safety: 10, unit: '包' },
  W007: { name: '魷魚天婦羅', safety: 10, unit: '包' },
  W008: { name: '花枝天婦羅', safety: 10, unit: '包' },
};

// Firebase REST API 設定
const FIREBASE_PROJECT_ID = 'xianle-stock';
const FIREBASE_API_KEY = 'AIzaSyAaHj8E5WWQrllzqZC7OvrYsybhnFbm1T4'; // PWA 用的公開 API Key

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

// 讀取 Firestore REST API
async function readFirestoreDoc(docPath) {
  return new Promise((resolve, reject) => {
    // 使用 Firestore REST API
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}?key=${FIREBASE_API_KEY}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// 解析 Firestore 文件資料
function parseFirestoreDoc(doc) {
  const items = {};
  if (doc.fields && doc.fields.items && doc.fields.items.mapValue) {
    const itemFields = doc.fields.items.mapValue.fields;
    for (const [key, value] of Object.entries(itemFields)) {
      if (value.integerValue !== undefined) {
        items[key] = parseInt(value.integerValue, 10);
      } else if (value.doubleValue !== undefined) {
        items[key] = parseFloat(value.doubleValue);
      }
    }
  }
  return items;
}

// 主程式
async function checkStockAlerts() {
  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  const docId = `stock_${today}`;
  
  console.log(`📅 ${today} 庫存檢查`);
  
  const alerts = [];
  const stores = ['總店', '麥金店'];

  for (const store of stores) {
    const fullDocId = `${store}_${today}`;
    console.log(`\n檢查 ${store}...`);
    
    try {
      const doc = await readFirestoreDoc(fullDocId);
      
      if (doc.fields) {
        const items = parseFirestoreDoc(doc);
        console.log(`  讀取成功，${Object.keys(items).length} 項資料`);
        
        // 檢查每項低於安全庫存
        for (const [id, stock] of SAFETY_STOCK) {
          const currentQty = items[id];
          if (currentQty !== undefined && currentQty < stock.safety) {
            alerts.push({
              store,
              id,
              name: stock.name,
              current: currentQty,
              safety: stock.safety,
              unit: stock.unit
            });
          }
        }
      } else {
        console.log(`  無資料`);
      }
    } catch (e) {
      console.error(`  錯誤: ${e.message}`);
    }
  }

  // 發送通知
  console.log(`\n⚠️ 低於安全庫存: ${alerts.length} 項`);
  
  if (alerts.length > 0) {
    const alertByStore = {};
    for (const a of alerts) {
      if (!alertByStore[a.store]) alertByStore[a.store] = [];
      alertByStore[a.store].push(a);
    }
    
    let message = `🔔 鮮樂炸雞 低庫存警示\n${'━'.repeat(22)}\n`;
    message += `📅 ${today}\n\n`;
    
    for (const [store, items] of Object.entries(alertByStore)) {
      message += `🏪 ${store}\n`;
      for (const item of items) {
        message += `⚠️ ${item.name}\n`;
        message += `   庫存: ${item.current}${item.unit} (安全: ${item.safety}${item.unit})\n`;
      }
      message += `\n`;
    }
    
    message += `${'━'.repeat(22)}\n`;
    message += `📊 ${REORDER_DAYS}天備貨建議\n`;
    message += `🔗 https://q1211q5478-ai.github.io/xianle-stock/dashboard.html`;
    
    try {
      await sendTelegram(message);
      console.log('✅ 通知已發送到 Telegram');
    } catch (e) {
      console.error('❌ 發送失敗:', e.message);
    }
  } else {
    console.log('✅ 所有品項庫存正常');
  }
}

// 執行
checkStockAlerts().catch(e => {
  console.error('執行錯誤:', e.message);
  process.exit(1);
});
