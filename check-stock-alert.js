// check-stock-alert.js
// 進貨建議系統：(7天日均用量 × 備貨天數) − 今日現貨 = 建議進貨量
// v2.0: 支援滾動7天平均實際用量計算

const https = require('https');

const TELEGRAM_BOT_TOKEN = '8650605122:AAEoPf9Omf5_sLk1B_jSkF01SW6GJPPZr6Y';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8614627016';

// ========== 設定規則 ==========
const REORDER_DAYS = 3; // 備貨天數
const HISTORY_DAYS = 7; // 滾動計算天數

// 各品項「預設平均每日用量」（無歷史資料時使用）
const DEFAULT_AVG_USAGE = {
  D001: { name: '雞排', avg: 5, unit: '盒' },
  D002: { name: '雞腿', avg: 8, unit: '盒' },
  D003: { name: '雞翅', avg: 6, unit: '盒' },
  D004: { name: '鹹酥雞', avg: 5, unit: '包' },
  D005: { name: '雞軟骨', avg: 4, unit: '包' },
  D006: { name: '甜不辣', avg: 4, unit: '包' },
  D007: { name: '薯條', avg: 4, unit: '包' },
  D008: { name: '脆薯', avg: 3, unit: '包' },
  D009: { name: '青椒', avg: 3, unit: '包' },
  D010: { name: '玉米', avg: 3, unit: '包' },
  D011: { name: '四季豆', avg: 3, unit: '包' },
  D012: { name: '杏鮑菇', avg: 3, unit: '包' },
  D013: { name: '香菇', avg: 3, unit: '包' },
  D014: { name: '豬血糕', avg: 10, unit: '包' },
  D015: { name: '雞蛋豆腐', avg: 3, unit: '盒' },
  D016: { name: '雞脖子', avg: 3, unit: '包' },
  D017: { name: '耐炸油', avg: 5, unit: '桶' },
  D018: { name: '脆皮粉', avg: 2, unit: '包' },
  D019: { name: '白色雞排粉', avg: 2, unit: '包' },
  W001: { name: '小卷天婦羅', avg: 3, unit: '包' },
  W002: { name: '包蛋天婦羅', avg: 3, unit: '包' },
  W003: { name: '地瓜', avg: 3, unit: '包' },
  W004: { name: '花枝丸', avg: 3, unit: '包' },
  W005: { name: '虱脆丸', avg: 5, unit: '包' },
  W006: { name: '豆干', avg: 3, unit: '包' },
  W007: { name: '百頁豆腐', avg: 10, unit: '包' },
  W008: { name: '起司條', avg: 3, unit: '包' },
  W009: { name: '魷米花', avg: 3, unit: '包' },
  W010: { name: '牛蒡甜不辣', avg: 3, unit: '包' },
  W011: { name: '雞心', avg: 30, unit: '串' },
  W012: { name: '雞胗', avg: 30, unit: '串' },
  W013: { name: '皮蛋', avg: 10, unit: '顆' },
  W014: { name: '糯米腸', avg: 5, unit: '包' },
  W015: { name: '銀絲卷', avg: 5, unit: '包' },
  W016: { name: '山藥捲', avg: 3, unit: '捲' },
  W017: { name: '玲玲捲', avg: 30, unit: '捲' },
  W018: { name: '鹹蛋黃芋泥球', avg: 3, unit: '包' },
  W019: { name: '洋蔥圈', avg: 5, unit: '包' },
  W020: { name: '可樂', avg: 20, unit: '罐' },
  W021: { name: '雪碧', avg: 20, unit: '罐' },
  W022: { name: '竹籤', avg: 3, unit: '包' },
  W023: { name: '八兩紙袋', avg: 10, unit: '包' },
  W024: { name: '六兩紙袋', avg: 10, unit: '包' },
  W025: { name: '四兩紙袋', avg: 10, unit: '包' },
  W026: { name: '飲料袋', avg: 5, unit: '包' },
  W027: { name: '半斤提袋', avg: 5, unit: '包' },
  W028: { name: '四兩提袋', avg: 8, unit: '包' },
};

// Firebase REST API 設定
const FIREBASE_PROJECT_ID = 'xianle-stock';
const FIREBASE_API_KEY = 'AIzaSyAaHj8E5WWQrllzqZC7OvrYsybhnFbm1T4';
const COLLECTION_NAME = 'stock';
const HISTORY_COLLECTION = 'stock_history';

// ========== 發送 Telegram（純文字）==========
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

// ========== 發送 Telegram（帶按鈕）==========
function sendTelegramWithButtons(message, inlineKeyboard) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      reply_markup: JSON.stringify({ inline_keyboard: inlineKeyboard }),
      parse_mode: 'HTML'
    });
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?${params.toString()}`;
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
function readFirestoreDoc(docPath, collection = COLLECTION_NAME) {
  return new Promise((resolve, reject) => {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docPath}?key=${FIREBASE_API_KEY}`;
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

// ========== 查詢 Firestore 集合（多筆文件）==========
function queryFirestoreCollection(collectionName, queries = []) {
  return new Promise((resolve, reject) => {
    let url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}?key=${FIREBASE_API_KEY}`;
    
    // 處理查詢參數
    if (queries.length > 0) {
      const filterStr = queries.map(q => {
        const op = q.op || '==';
        return encodeURIComponent(`(${q.field} ${op} ${q.value})`);
      }).join('&');
      url += `&filter=${filterStr}`;
    }
    
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

// ========== 寫入 Firestore REST API ==========
function writeFirestoreDoc(docPath, data, collection = COLLECTION_NAME) {
  return new Promise((resolve, reject) => {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}?documentId=${encodeURIComponent(docPath)}&key=${FIREBASE_API_KEY}`;
    
    const body = JSON.stringify({
      fields: data
    });
    
    const options = {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(data); }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ========== 解析 Firestore 文件 ==========
function parseFirestoreDoc(doc) {
  const items = {};
  if (!doc.fields) return items;
  
  // 格式一：items.mapValue（巢狀物件格式）
  if (doc.fields.items && doc.fields.items.mapValue) {
    const itemFields = doc.fields.items.mapValue.fields;
    for (const [key, value] of Object.entries(itemFields)) {
      if (value.integerValue !== undefined) {
        items[key] = parseInt(value.integerValue, 10);
      } else if (value.doubleValue !== undefined) {
        items[key] = parseFloat(value.doubleValue);
      } else if (value.stringValue !== undefined) {
        items[key] = parseFloat(value.stringValue);
      }
    }
  }
  
  // 格式二：items.D001, items.D002...（扁平格式）
  for (const [key, value] of Object.entries(doc.fields)) {
    if (key.startsWith('items.')) {
      const itemId = key.replace('items.', '');
      if (!items[itemId]) {
        if (value.integerValue !== undefined) {
          items[itemId] = parseInt(value.integerValue, 10);
        } else if (value.doubleValue !== undefined) {
          items[itemId] = parseFloat(value.doubleValue);
        } else if (value.stringValue !== undefined) {
          items[itemId] = parseFloat(value.stringValue);
        }
      }
    }
  }
  
  return items;
}

// ========== 物件轉 Firestore 格式 ==========
function toFirestoreValue(value) {
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: value.toString() };
    }
    return { doubleValue: value.toString() };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (value === null) {
    return { nullValue: 'NULL_VALUE' };
  }
  return { stringValue: String(value) };
}

// ========== 儲存歷史快照 ==========
async function saveHistorySnapshot(store, date, items) {
  const docId = `${store}_${date}`;
  const fields = {
    store: toFirestoreValue(store),
    date: toFirestoreValue(date),
    items: {
      mapValue: {
        fields: {}
      }
    },
    savedAt: toFirestoreValue(new Date().toISOString())
  };
  
  // 將 items 轉換為 Firestore 格式
  for (const [key, value] of Object.entries(items)) {
    fields.items.mapValue.fields[key] = toFirestoreValue(value);
  }
  
  try {
    await writeFirestoreDoc(docId, fields, HISTORY_COLLECTION);
    console.log(`  ✅ 已儲存 ${store} ${date} 歷史快照`);
    return true;
  } catch (e) {
    console.error(`  ❌ 儲存歷史快照失敗: ${e.message}`);
    return false;
  }
}

// ========== 讀取歷史用量（計算消耗量）==========
async function getHistoricalUsage(store, itemId, days = 7) {
  try {
    const result = await queryFirestoreCollection(HISTORY_COLLECTION);
    
    if (!result.documents || result.documents.length === 0) {
      return null; // 沒有歷史資料
    }
    
    // 收集過去 N 天的庫存資料
    const historyByDate = {};
    for (const doc of result.documents) {
      const docId = doc.name.split('/').pop();
      const parts = docId.split('_');
      if (parts.length >= 2 && parts[0] === store) {
        const date = parts.slice(1).join('_');
        const fields = doc.fields;
        
        // 嘗試讀取 items
        let items = {};
        if (fields.items && fields.items.mapValue && fields.items.mapValue.fields) {
          items = fields.items.mapValue.fields;
        }
        
        historyByDate[date] = items;
      }
    }
    
    // 計算滾動 N 天的消耗量
    const dates = Object.keys(historyByDate).sort().slice(-days);
    if (dates.length < 2) {
      return null; // 資料不足
    }
    
    // 計算每天的消耗量（今天庫存 - 明天庫存 = 消耗量）
    let totalConsumption = 0;
    let validDays = 0;
    
    for (let i = 0; i < dates.length - 1; i++) {
      const today = historyByDate[dates[i]];
      const tomorrow = historyByDate[dates[i + 1]];
      
      const todayQty = today[itemId] ? parseFloat(today[itemId].integerValue || today[itemId].doubleValue || today[itemId].stringValue || 0) : 0;
      const tomorrowQty = tomorrow[itemId] ? parseFloat(tomorrow[itemId].integerValue || tomorrow[itemId].doubleValue || tomorrow[itemId].stringValue || 0) : 0;
      
      // 消耗量 = 明天補充 - 今天結餘（因為補充後庫存會增加）
      // 或者簡單說：如果明天庫存低於今天，差額就是消耗
      // 但更準確：消耗 = 昨天的補充量（因為我們記錄的是關店時的庫存）
      
      const consumption = todayQty - tomorrowQty;
      if (consumption > 0) {
        totalConsumption += consumption;
        validDays++;
      }
    }
    
    if (validDays === 0) {
      return null;
    }
    
    return totalConsumption / validDays; // 日均消耗
  } catch (e) {
    console.error(`  ⚠️ 讀取歷史失敗 ${store} ${itemId}: ${e.message}`);
    return null;
  }
}

// ========== 計算滾動7天平均用量 ==========
async function calculateRollingAvgUsage(store) {
  const result = {};
  
  for (const itemId of Object.keys(DEFAULT_AVG_USAGE)) {
    const historicalAvg = await getHistoricalUsage(store, itemId, HISTORY_DAYS);
    
    if (historicalAvg !== null && historicalAvg > 0) {
      result[itemId] = {
        ...DEFAULT_AVG_USAGE[itemId],
        avg: Math.round(historicalAvg * 10) / 10, // 四捨五入到小數點後一位
        isCalculated: true
      };
    } else {
      result[itemId] = {
        ...DEFAULT_AVG_USAGE[itemId],
        isCalculated: false
      };
    }
  }
  
  return result;
}

// ========== 主程式 ==========
async function checkStockAlerts() {
  // 改為檢查「昨天」的資料（員工關店後填的庫存）
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const checkDate = yesterday.toISOString().split('T')[0];
  const checkDateDisplay = yesterday.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  console.log(`📅 ${checkDate} 庫存檢查（昨日關店資料）`);
  
  const reorderList = [];
  const stores = ['總店', '麥金店'];

  for (const store of stores) {
    const fullDocId = `${store}_${checkDate}`;
    console.log(`\n檢查 ${store}...`);
    
    try {
      const doc = await readFirestoreDoc(fullDocId);
      if (doc.fields) {
        const items = parseFirestoreDoc(doc);
        console.log(`  讀取成功，${Object.keys(items).length} 項`);
        
        // 先儲存歷史快照（用於未來計算）
        await saveHistorySnapshot(store, checkDate, items);
        
        // 計算滾動7天平均用量
        console.log(`  計算滾動平均用量...`);
        const avgUsage = await calculateRollingAvgUsage(store);
        
        // 計算每項的建議進貨量
        for (const [id, itemInfo] of Object.entries(avgUsage)) {
          const currentQty = items[id];
          if (currentQty !== undefined) {
            // 建議進貨量 = (日均用量 × 備貨天數) − 今日現貨
            const targetStock = Math.ceil(itemInfo.avg * REORDER_DAYS);
            const suggestedOrder = targetStock - currentQty;
            
            // 只在需要進貨時加入列表（suggestedOrder > 0）
            if (suggestedOrder > 0) {
              reorderList.push({
                store,
                id,
                name: itemInfo?.name || id,
                current: currentQty,
                avgDaily: itemInfo?.avg || null,
                avgSource: itemInfo.isCalculated ? '實際' : '預設',
                target: targetStock,
                order: suggestedOrder,
                unit: itemInfo?.unit || ''
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
    
    // 建立按鈕（每個品項：品名｜＋1｜＋3｜＋5｜✏️）
    const buttons = [];
    for (const item of reorderList) {
      const shortName = item.name.length > 6 ? item.name.substring(0, 6) + '…' : item.name;
      buttons.push([
        { text: `${shortName}`, callback_data: `info:${item.store}:${item.id}` },
        { text: `＋1`, callback_data: `restock:${item.store}:${item.id}:1` },
        { text: `＋3`, callback_data: `restock:${item.store}:${item.id}:3` },
        { text: `＋5`, callback_data: `restock:${item.store}:${item.id}:5` },
        { text: `✏️`, callback_data: `manual:${item.store}:${item.id}` }
      ]);
    }
    buttons.push([{ text: '📊 查看完整庫存儀表板', url: 'https://q1211q5478-ai.github.io/xianle-stock/dashboard.html' }]);
    
    let message = `<b>📦 鮮樂炸雞 進貨建議</b>\n`;
    message += `${'─'.repeat(24)}\n`;
    message += `📅 ${checkDateDisplay}（昨日關店資料）\n`;
    message += `📊 公式：(日均用量 × ${REORDER_DAYS}天) − 今日現貨\n`;
    message += `📈 日均用量：滾動${HISTORY_DAYS}天平均（📊=實際/⚙️=預設）\n\n`;
    
    for (const [store, storeItems] of Object.entries(byStore)) {
      message += `<b>🏪 ${store}</b>\n`;
      for (const item of storeItems) {
        const avgTag = item.avgSource === '實際' ? '📊' : '⚙️';
        message += `🛒 ${item.name}\n`;
        message += `   現貨: ${item.current}${item.unit}`;
        message += item.avgDaily !== null ? `  日均: ${avgTag}${item.avgDaily}${item.unit}` : '';
        message += `  建議進貨: <b>+${item.order}${item.unit}</b>\n\n`;
      }
    }
    message += `${'─'.repeat(24)}\n`;
    message += `💡 點選下方按鈕快速回報補貨\n`;
    message += `🔗 https://q1211q5478-ai.github.io/xianle-stock/dashboard.html`;
    
    try {
      await sendTelegramWithButtons(message, buttons);
      console.log('✅ 進貨建議已發送到 Telegram（帶按鈕）');
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
