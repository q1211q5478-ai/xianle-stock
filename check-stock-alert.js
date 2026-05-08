// check-stock-alert.js
// 進貨建議推播 v3.0
// 與 index.html 前台 ITEMS 同步（M/V/T/S/P/C 系統）
// 公式：(日均用量 × 備貨天數) − 今日現貨 = 建議進貨量

const https = require('https');

const TELEGRAM_BOT_TOKEN = '8650605122:AAEoPf9Omf5_sLk1B_jSkF01SW6GJPPZr6Y';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8614627016';

// ========== 設定規則 ==========
const REORDER_DAYS = 3;   // 備貨天數
const HISTORY_DAYS = 7;   // 滾動計算天數

// ========== Firebase REST API ==========
const FIREBASE_PROJECT_ID = 'xianle-stock';
const FIREBASE_API_KEY = 'AIzaSyAaHj8E5WWQrllzqZC7OvrYsybhnFbm1T4';
const STOCK_COLLECTION = 'stock';

// ========== 品項資料（與 index.html 前台同步）==========
const ITEMS = {
  M: [  // 肉品
    { id: 'M001', cn: '雞排',   unit: '盒', low: 2 },
    { id: 'M002', cn: '雞腿',   unit: '盒', low: 1 },
    { id: 'M003', cn: '雞翅',   unit: '盒', low: 1 },
    { id: 'M004', cn: '鹹酥雞', unit: '包', low: 5 },
    { id: 'M005', cn: '雞軟骨', unit: '包', low: 3 },
    { id: 'M006', cn: '雞皮',   unit: '包', low: 3 },
    { id: 'M007', cn: '雞脖子', unit: '包', low: 3 },
    { id: 'M008', cn: '雞屁股', unit: '支', low: 10 },
    { id: 'M009', cn: '雞心',   unit: '串', low: 20 },
    { id: 'M010', cn: '雞胗',   unit: '串', low: 20 },
  ],
  V: [  // 蔬菜
    { id: 'V001', cn: '青椒',   unit: '包', low: 5 },
    { id: 'V002', cn: '玉米',   unit: '包', low: 5 },
    { id: 'V003', cn: '四季豆', unit: '包', low: 5 },
    { id: 'V004', cn: '杏鮑菇', unit: '包', low: 5 },
    { id: 'V005', cn: '香菇',   unit: '包', low: 5 },
    { id: 'V006', cn: '玉米筍', unit: '包', low: 5 },
    { id: 'V007', cn: '洋蔥圈', unit: '包', low: 4 },
  ],
  T: [  // 天婦羅
    { id: 'T001', cn: '甜不辣',       unit: '包', low: 3 },
    { id: 'T002', cn: '薯條',         unit: '包', low: 3 },
    { id: 'T003', cn: '脆薯',         unit: '包', low: 2 },
    { id: 'T004', cn: '小卷天婦羅',   unit: '包', low: 1 },
    { id: 'T005', cn: '包蛋天婦羅',   unit: '包', low: 1 },
    { id: 'T006', cn: '地瓜',         unit: '包', low: 1 },
    { id: 'T007', cn: '花枝丸',       unit: '包', low: 1 },
    { id: 'T008', cn: '虱脆丸',       unit: '包', low: 3 },
    { id: 'T009', cn: '魷米花',       unit: '包', low: 2 },
    { id: 'T010', cn: '牛蒡甜不辣',   unit: '包', low: 2 },
    { id: 'T011', cn: '山藥捲',       unit: '捲', low: 1 },
    { id: 'T012', cn: '玲玲捲',       unit: '捲', low: 20 },
    { id: 'T013', cn: '鹹蛋黃芋泥球', unit: '包', low: 1 },
  ],
  S: [  // 點心
    { id: 'S001', cn: '豬血糕',   unit: '包', low: 15 },
    { id: 'S002', cn: '雞蛋豆腐', unit: '盒', low: 5 },
    { id: 'S003', cn: '豆干',     unit: '包', low: 2 },
    { id: 'S004', cn: '百頁豆腐', unit: '包', low: 15 },
    { id: 'S005', cn: '起司條',   unit: '包', low: 2 },
    { id: 'S006', cn: '皮蛋',     unit: '顆', low: 6 },
    { id: 'S007', cn: '糯米腸',   unit: '包', low: 5 },
    { id: 'S008', cn: '銀絲卷',   unit: '包', low: 3 },
  ],
  P: [  // 包材
    { id: 'P001', cn: '竹籤',     unit: '包', low: 2 },
    { id: 'P002', cn: '八兩紙袋', unit: '包', low: 10 },
    { id: 'P003', cn: '六兩紙袋', unit: '包', low: 10 },
    { id: 'P004', cn: '四兩紙袋', unit: '包', low: 10 },
    { id: 'P005', cn: '飲料袋',   unit: '包', low: 5 },
    { id: 'P006', cn: '半斤提袋', unit: '包', low: 5 },
    { id: 'P007', cn: '四兩提袋', unit: '包', low: 8 },
    { id: 'P008', cn: '垃圾袋',   unit: '捆', low: 1 },
  ],
  C: [  // 乾貨區
    { id: 'C001', cn: '耐炸油',  unit: '桶', low: 2 },
    { id: 'C002', cn: '脆皮粉',  unit: '包', low: 1 },
    { id: 'C003', cn: '白色雞排粉', unit: '包', low: 1 },
    { id: 'C004', cn: '胡椒粉',  unit: '包', low: 2 },
    { id: 'C005', cn: '辣椒粉',  unit: '包', low: 2 },
    { id: 'C006', cn: '梅子粉',  unit: '包', low: 2 },
    { id: 'C007', cn: '可樂',    unit: '罐', low: 24 },
    { id: 'C008', cn: '雪碧',    unit: '罐', low: 24 },
  ],
};

// 預設日均用量（無歷史資料時使用）
const DEFAULT_AVG = {
  M001:5, M002:8, M003:6, M004:5, M005:4,
  V001:3, V002:3, V003:3, V004:3, V005:3, V006:3, V007:5,
  T001:4, T002:4, T003:3, T004:3, T005:3, T006:3, T007:3, T008:5, T009:3, T010:3, T011:3, T012:30, T013:3,
  S001:10, S002:3, S003:3, S004:10, S005:3, S006:10, S007:5, S008:5,
  P001:3, P002:10, P003:10, P004:10, P005:5, P006:5, P007:8, P008:1,
  C001:5, C002:2, C003:2, C004:2, C005:2, C006:2, C007:20, C008:20,
};

// ========== Firestore REST API ==========
function firestoreDoc(method, collection, docId, data) {
  return new Promise((resolve, reject) => {
    const encodedDoc = encodeURIComponent(docId);
    let url, body;
    if (method === 'GET') {
      url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodedDoc}?key=${FIREBASE_API_KEY}`;
      body = null;
    } else if (method === 'PATCH') {
      const params = new URLSearchParams({ key: FIREBASE_API_KEY });
      const fieldPaths = Object.keys(data);
      fieldPaths.forEach(fp => params.append('updateMask.fieldPaths', fp));
      url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodedDoc}?${params.toString()}`;
      body = JSON.stringify({ fields: data });
    }
    const options = {
      method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body || '') }
    };
    const req = https.request(url, options, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { resolve(d); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function firestoreQuery(collection, queryBody) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(queryBody);
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIREBASE_API_KEY}`,
      options,
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve([]); } }); }
    );
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function firestoreDelete(collection, docId) {
  return new Promise((resolve, reject) => {
    const encodedDoc = encodeURIComponent(docId);
    const options = {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    };
    const req = https.request(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodedDoc}?key=${FIREBASE_API_KEY}`,
      options,
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } }); }
    );
    req.on('error', reject);
    req.end();
  });
}

// ========== 解析 Firestore 文件 items ==========
function parseItems(fields) {
  const items = {};
  if (fields.items && typeof fields.items === 'object') {
    for (const [k, v] of Object.entries(fields.items)) {
      items[k] = typeof v === 'number' ? v
        : (v?.integerValue !== undefined ? parseInt(v.integerValue) : v?.doubleValue !== undefined ? parseFloat(v.doubleValue) : 0);
    }
  }
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith('items.')) {
      const id = k.replace('items.', '');
      if (!items[id]) {
        items[id] = typeof v === 'number' ? v
          : (v?.integerValue !== undefined ? parseInt(v.integerValue) : v?.doubleValue !== undefined ? parseFloat(v.doubleValue) : 0);
      }
    }
  }
  return items;
}

// ========== Telegram 發送 ==========
function sendTelegram(msg, keyboard) {
  return new Promise((resolve, reject) => {
    const params = {
      chat_id: TELEGRAM_CHAT_ID,
      text: msg,
      parse_mode: 'HTML'
    };
    if (keyboard) params.reply_markup = JSON.stringify({ inline_keyboard: keyboard });
    const query = new URLSearchParams(params).toString();
    const req = https.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?${query}`, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    req.on('error', reject);
  });
}

// ========== 取得所有 ITEMS ID ==========
function getAllItems() {
  const all = [];
  for (const group of Object.values(ITEMS)) all.push(...group);
  return all;
}

// ========== 主程式 ==========
async function checkStockAlerts() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const checkDate = yesterday.toISOString().split('T')[0];
  const checkDateDisplay = yesterday.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  console.log(`📅 ${checkDate} 庫存檢查`);
  const allItems = getAllItems();
  const reorderList = [];
  const stores = ['總店', '麥金店'];

  for (const store of stores) {
    const docId = `${store}_${checkDate}`;
    console.log(`\n檢查 ${store} (${docId})...`);

    try {
      const doc = await firestoreDoc('GET', STOCK_COLLECTION, docId);
      if (doc.error) {
        console.log(`  無資料（${doc.error.message}）`);
        continue;
      }

      const items = parseItems(doc.fields || {});
      console.log(`  讀取成功，${Object.keys(items).length} 項`);

      // 計算進貨建議
      for (const item of allItems) {
        const currentQty = items[item.id];
        if (currentQty === undefined) continue;

        const avg = DEFAULT_AVG[item.id] || 3;
        const targetStock = Math.ceil(avg * REORDER_DAYS);
        const suggestedOrder = targetStock - currentQty;

        if (suggestedOrder > 0) {
          reorderList.push({
            store, id: item.id, name: item.cn,
            current: currentQty, avg, target: targetStock,
            order: suggestedOrder, unit: item.unit
          });
        }
      }
    } catch (e) {
      console.error(`  錯誤: ${e.message}`);
    }
  }

  console.log(`\n📦 需要進貨: ${reorderList.length} 項`);

  if (reorderList.length === 0) {
    console.log('✅ 庫存充足，無需進貨');
    return;
  }

  // 按店別分組
  const byStore = {};
  for (const item of reorderList) {
    if (!byStore[item.store]) byStore[item.store] = [];
    byStore[item.store].push(item);
  }

  // 按鈕（每品項一行：品名｜＋1｜＋3｜＋5｜✏️）
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
  buttons.push([
    { text: '📊 查看完整庫存儀表板', url: 'https://q1211q5478-ai.github.io/xianle-stock/dashboard.html' }
  ]);

  let message = `<b>📦 鮮樂炸雞 進貨建議</b>\n`;
  message += `${'─'.repeat(22)}\n`;
  message += `${checkDateDisplay}（昨日關店資料）\n\n`;

  for (const [store, storeItems] of Object.entries(byStore)) {
    message += `<b>🏪 ${store}</b>\n`;
    for (const item of storeItems) {
      message += `<b>▸ ${item.name}</b>　+${item.order}${item.unit}\n`;
    }
    message += '\n';
  }

  message += `${'─'.repeat(22)}\n`;
  message += `💡 選擇品項 → 增減數量 → 直接更新庫存`;

  try {
    await sendTelegram(message, buttons);
    console.log('✅ 推播已發送');
  } catch (e) {
    console.error('❌ 發送失敗:', e.message);
  }
}

// 執行
checkStockAlerts().catch(e => {
  console.error('執行錯誤:', e.message);
  process.exit(1);
});