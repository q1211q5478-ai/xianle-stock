// check-stock-alert.js
// 進貨建議系統：(7天日均用量 × 備貨天數) − 今日現貨 = 建議進貨量

const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ========== 設定規則 ==========
const REORDER_DAYS = 3; // 備貨天數

// 各品項「平均每日用量」（7天滾動平均預估值）
// 這個數字會根據實際使用資料動態更新
const AVG_DAILY_USAGE = {
  D001: { name: '雞腿', avg: 8, unit: '盒' },
  D002: { name: '雞翅', avg: 6, unit: '盒' },
  D003: { name: '雞塊', avg: 5, unit: '盒' },
  D004: { name: '鹹酥雞', avg: 5, unit: '包' },
  D005: { name: '薯條', avg: 4, unit: '包' },
  D006: { name: '地瓜', avg: 3, unit: '包' },
  D007: { name: '銀絲捲', avg: 3, unit: '包' },
  D008: { name: '甜不辣', avg: 4, unit: '包' },
  D009: { name: '天婦羅', avg: 4, unit: '包' },
  D010: { name: '裹粉', avg: 3, unit: '包' },
  D011: { name: '脆皮粉', avg: 3, unit: '包' },
  D012: { name: '胡椒粉', avg: 1, unit: '罐' },
  D013: { name: '梅粉', avg: 1, unit: '罐' },
  D014: { name: '回鍋油', avg: 5, unit: '公升' },
  D015: { name: '新油', avg: 8, unit: '公升' },
  W001: { name: '魚漿', avg: 5, unit: '公斤' },
  W002: { name: '天婦羅皮', avg: 5, unit: '包' },
  W003: { name: '甜不辣糊', avg: 4, unit: '公斤' },
  W004: { name: '包蛋黑輪', avg: 8, unit: '條' },
  W005: { name: '牛蒡天婦羅', avg: 4, unit: '包' },
  W006: { name: '小卷天婦羅', avg: 4, unit: '包' },
  W007: { name: '魷魚天婦羅', avg: 4, unit: '包' },
  W008: { name: '花枝天婦羅', avg: 4, unit: '包' },
};

// Firebase REST API 設定
const FIREBASE_PROJECT_ID = 'xianle-stock';
const FIREBASE_API_KEY = 'AIzaSyAaHj8E5WWQrllzqZC7OvrYsybhnFbm1T4';
const COLLECTION_NAME = 'stock';

// ========== 發送 Telegram ==========
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

// ========== 讀取 Firestore REST API ==========
function readFirestoreDoc(docPath) {
  return new Promise((resolve, reject) => {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${COLLECTION_NAME}/${docPath}?key=${FIREBASE_API_KEY}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ========== 解析 Firestore 文件 ==========
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

// ========== 主程式 ==========
async function checkStockAlerts() {
  const today = new Date().toISOString().split('T')[0];
  const todayDisplay = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  console.log(`📅 ${today} 庫存檢查`);
  
  const reorderList = [];
  const stores = ['總店', '麥金店'];

  for (const store of stores) {
    const fullDocId = `${store}_${today}`;
    console.log(`\n檢查 ${store}...`);
    
    try {
      const doc = await readFirestoreDoc(fullDocId);
      if (doc.fields) {
        const items = parseFirestoreDoc(doc);
        console.log(`  讀取成功，${Object.keys(items).length} 項`);
        
        // 計算每項的建議進貨量
        for (const [id, itemInfo] of Object.entries(AVG_DAILY_USAGE)) {
          const currentQty = items[id];
          if (currentQty !== undefined) {
            // 建議進貨量 = (7天日均 × 備貨天數) − 今日現貨
            const targetStock = itemInfo.avg * REORDER_DAYS;
            const suggestedOrder = targetStock - currentQty;
            
            // 只在需要進貨時加入列表（suggestedOrder > 0）
            if (suggestedOrder > 0) {
              reorderList.push({
                store,
                id,
                name: itemInfo.name,
                current: currentQty,
                avgDaily: itemInfo.avg,
                target: targetStock,
                order: suggestedOrder,
                unit: itemInfo.unit
              });
            }
          }
        }
      } else {
        console.log(`  無資料`);
      }
    } catch (e) {
      console.error(`  錯誤: ${e.message}`);
    }
  }

  console.log(`\n📦 需要進貨: ${reorderList.length} 項`);
  
  if (reorderList.length > 0) {
    // 按店別分組
    const byStore = {};
    for (const item of reorderList) {
      if (!byStore[item.store]) byStore[item.store] = [];
      byStore[item.store].push(item);
    }
    
    let message = `📦 鮮樂炸雞 進貨建議\n`;
    message += `${'━'.repeat(24)}\n`;
    message += `📅 ${todayDisplay}\n`;
    message += `📊 公式：(日均用量 × ${REORDER_DAYS}天) − 今日現貨\n\n`;
    
    for (const [store, items] of Object.entries(byStore)) {
      message += `🏪 ${store}\n`;
      for (const item of items) {
        message += `🛒 ${item.name}\n`;
        message += `   今日現貨: ${item.current}${item.unit}\n`;
        message += `   日均用量: ${item.avg}${item.unit}\n`;
        message += `   目標備量: ${item.target}${item.unit}\n`;
        message += `   ✅ 建議進貨: ${item.order}${item.unit}\n\n`;
      }
    }
    
    message += `${'━'.repeat(24)}\n`;
    message += `🔗 https://q1211q5478-ai.github.io/xianle-stock/dashboard.html`;
    
    try {
      await sendTelegram(message);
      console.log('✅ 進貨建議已發送到 Telegram');
    } catch (e) {
      console.error('❌ 發送失敗:', e.message);
    }
  } else {
    console.log('✅ 庫存充足，無需進貨');
  }
}

// 執行
checkStockAlerts().catch(e => {
  console.error('執行錯誤:', e.message);
  process.exit(1);
});
