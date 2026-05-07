#!/usr/bin/env node
// stock-bot.js
// 庫存 Bot：處理補貨回覆按鈕（@Xianle5478_bot）
// Token: 8650605122:AAEoPf9Omf5_sLk1B_jSkF01SW6GJPPZr6Y

const https = require('https');

const TELEGRAM_BOT_TOKEN = '8650605122:AAEoPf9Omf5_sLk1B_jSkF01SW6GJPPZr6Y';
const TELEGRAM_CHAT_ID = '8614627016';
const FIREBASE_PROJECT_ID = 'xianle-stock';
const FIREBASE_API_KEY = 'AIzaSyAaHj8E5WWQrllzqZC7OvrYsybhnFbm1T4';
const STOCK_COLLECTION = 'stock';
const LOG_COLLECTION = 'stock_log';

console.log('🟢 庫存 Bot 啟動中...');

// ========== 待處理狀態 ==========
const pendingManual = new Map(); // chatId -> { store, itemId, messageId }

// ========== Firestore REST API ==========
function firestoreRunQuery(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(query);
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIREBASE_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function firestorePatchDoc(collection, docId, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ fields: data });
    const docPath = encodeURIComponent(collection) + '/' + encodeURIComponent(docId);
    const fieldPaths = Object.keys(data).map(k => 'fields.' + k);
    const params = new URLSearchParams({ key: FIREBASE_API_KEY });
    fieldPaths.forEach(fp => params.append('updateMask.fieldPaths', fp));
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}?${params.toString()}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function firestoreAddDoc(collection, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ fields: data });
    const colPath = encodeURIComponent(collection);
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${colPath}?key=${FIREBASE_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ========== Telegram REST API ==========
function telegramPost(method, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(bodyObj);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function telegramAnswerCallbackQuery(callbackQueryId, text, showAlert = false) {
  return telegramPost('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text,
    show_alert: showAlert
  });
}

function telegramEditMessageReplyMarkup(chatId, messageId, inlineKeyboard) {
  return telegramPost('editMessageReplyMarkup', {
    chat_id: String(chatId),
    message_id: parseInt(messageId),
    reply_markup: JSON.stringify({ inline_keyboard: inlineKeyboard })
  });
}

function telegramSendMessage(chatId, text, replyToMessageId = null) {
  const body = { chat_id: String(chatId), text, parse_mode: 'HTML' };
  if (replyToMessageId) body.reply_to_message_id = parseInt(replyToMessageId);
  return telegramPost('sendMessage', body);
}

// ========== 處理補貨回覆 ==========
async function handleManual(callbackQueryId, chatId, messageId, data) {
  console.log('handleManual called:', { callbackQueryId, chatId, messageId, data });
  
  const parts = data.split(':');
  if (parts.length !== 3) return;
  
  const [, store, itemId] = parts;
  
  // 回覆 callback 並要求使用者輸入數量
  await telegramAnswerCallbackQuery(callbackQueryId, `請輸入數量：\n例如：8`, true);
  
  // 發送訊息問使用者要輸入多少
  const msg = `📝 <b>手動輸入補貨數量</b>\n\n請回覆數字（例：8）\n品項：${itemId}\n店面：${store}`;
  await telegramSendMessage(chatId, msg);
  
  // 等待回覆（暫存狀態）
  pendingManual.set(String(chatId), { store, itemId, messageId });
}

async function handleRestock(callbackQueryId, chatId, messageId, data) {
  console.log('handleRestock called:', { callbackQueryId, chatId, messageId, data });
  
  // 先立刻回覆 callback（避免超時）
  // telegramAnswerCallbackQuery(callbackQueryId, '處理中...').catch(e => console.log('預回覆失敗:', e.message));
  //（拿掉預回覆，避免覆蓋最終回覆）
  
  const parts = data.split(':');
  if (parts.length !== 4) return;
  
  const [, store, itemId, qtyStr] = parts;
  const qty = parseInt(qtyStr);
  if (isNaN(qty) || qty <= 0) {
    await telegramAnswerCallbackQuery(callbackQueryId, '數量無效', true);
    return;
  }
  
  const today = new Date().toISOString().split('T')[0];
  console.log('today=', today, 'store=', store, 'itemId=', itemId, 'qty=', qty);
  
  // 查詢該店最新庫存文件
  let currentQty = 0;
  try {
    const query = {
      structuredQuery: {
        from: [{ collectionId: STOCK_COLLECTION }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'store' }, op: 'EQUAL', value: { stringValue: store } } }
            ]
          }
        }
      }
    };
    const results = await firestoreRunQuery(query);
    console.log('Firestore results count:', results?.length);
    
    // 取最新日期的文件
    let latestDoc = null;
    for (const r of (results || [])) {
      if (r.document && r.document.fields) {
        const d = r.document.fields.date?.stringValue || '';
        if (!latestDoc || d > (latestDoc.document?.fields?.date?.stringValue || '')) {
          latestDoc = r;
        }
      }
    }
    
    if (latestDoc?.document?.fields) {
      const fields = latestDoc.document.fields;
      const itemField = fields[`items.${itemId}`];
      if (itemField) {
        currentQty = parseInt(itemField.integerValue || itemField.doubleValue || 0);
      }
    }
    console.log('currentQty:', currentQty);
  } catch(e) {
    console.error('查詢失敗:', e.message);
    await telegramAnswerCallbackQuery(callbackQueryId, '查詢失敗：' + e.message, true);
    return;
  }
  
  const newQty = currentQty + qty;
  const docId = `${store}_${today}`;
  
  // 更新 Firestore
  try {
    await firestorePatchDoc(STOCK_COLLECTION, docId, {
      [`items.${itemId}`]: { integerValue: String(newQty) },
      updatedAt: { timestampValue: new Date().toISOString() }
    });
    console.log('PATCH 成功:', docId);
  } catch(e) {
    console.error('PATCH 失敗:', e.message);
    // 文件不存在，先建立
    try {
      await firestoreAddDoc(STOCK_COLLECTION, {
        store: { stringValue: store },
        date: { stringValue: today },
        [`items.${itemId}`]: { integerValue: String(newQty) },
        updatedAt: { timestampValue: new Date().toISOString() }
      });
      console.log('ADD 成功');
    } catch(e2) {
      await telegramAnswerCallbackQuery(callbackQueryId, '更新失敗：' + e2.message, true);
      return;
    }
  }
  
  // 寫入補貨日誌
  try {
    await firestoreAddDoc(LOG_COLLECTION, {
      store: { stringValue: store },
      itemId: { stringValue: itemId },
      qty: { integerValue: String(qty) },
      before: { integerValue: String(currentQty) },
      after: { integerValue: String(newQty) },
      date: { stringValue: today },
      timestamp: { timestampValue: new Date().toISOString() }
    });
  } catch(e) {
    console.error('寫入補貨日誌失敗:', e.message);
  }
  
  // toast 彈出提醒（editMessageReplyMarkup 會被第二次 answerCallbackQuery 忽略，故只留 toast）
  await telegramAnswerCallbackQuery(callbackQueryId, `✅ ${itemId}：${currentQty} → ${newQty}　庫存已更新！`, true);
  console.log('完成!');
}

// 手動輸入數量後的處理（整合 handleRestock 的核心邏輯）
async function handleManualRestock(chatId, store, itemId, qty) {
  console.log('handleManualRestock:', { chatId, store, itemId, qty });
  const today = new Date().toISOString().split('T')[0];
  
  let currentQty = 0;
  try {
    const query = {
      structuredQuery: {
        from: [{ collectionId: STOCK_COLLECTION }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'store' }, op: 'EQUAL', value: { stringValue: store } } }
            ]
          }
        }
      }
    };
    const results = await firestoreRunQuery(query);
    let latestDoc = null;
    for (const r of (results || [])) {
      if (r.document && r.document.fields) {
        const d = r.document.fields.date?.stringValue || '';
        if (!latestDoc || d > (latestDoc.document?.fields?.date?.stringValue || '')) {
          latestDoc = r;
        }
      }
    }
    if (latestDoc?.document?.fields) {
      const itemField = latestDoc.document.fields[`items.${itemId}`];
      if (itemField) currentQty = parseInt(itemField.integerValue || itemField.doubleValue || 0);
    }
  } catch(e) {
    console.error('查詢失敗:', e.message);
    await telegramSendMessage(chatId, '❌ 查詢庫存失敗：' + e.message);
    return;
  }
  
  const newQty = currentQty + qty;
  const docId = `${store}_${today}`;
  
  try {
    await firestorePatchDoc(STOCK_COLLECTION, docId, {
      [`items.${itemId}`]: { integerValue: String(newQty) },
      updatedAt: { timestampValue: new Date().toISOString() }
    });
  } catch(e) {
    try {
      await firestoreAddDoc(STOCK_COLLECTION, {
        store: { stringValue: store },
        date: { stringValue: today },
        [`items.${itemId}`]: { integerValue: String(newQty) },
        updatedAt: { timestampValue: new Date().toISOString() }
      });
    } catch(e2) {
      await telegramSendMessage(chatId, '❌ 更新失敗：' + e2.message);
      return;
    }
  }
  
  try {
    await firestoreAddDoc(LOG_COLLECTION, {
      store: { stringValue: store },
      itemId: { stringValue: itemId },
      qty: { integerValue: String(qty) },
      before: { integerValue: String(currentQty) },
      after: { integerValue: String(newQty) },
      date: { stringValue: today },
      timestamp: { timestampValue: new Date().toISOString() }
    });
  } catch(e) {
    console.error('寫入補貨日誌失敗:', e.message);
  }
  
  await telegramSendMessage(chatId, `✅ ${itemId}：${currentQty} → ${newQty}　手動補貨完成！`);
}

// ========== Telegram Polling ==========
let offset = 0;

async function getUpdates() {
  try {
    const result = await telegramPost('getUpdates', { offset, timeout: 30 });
    if (result.ok && result.result && result.result.length > 0) {
      for (const update of result.result) {
        offset = update.update_id + 1;
        
        if (update.callback_query) {
          const cq = update.callback_query;
          const data = cq.data;
          if (data && data.startsWith('restock:')) {
            console.log('收到 callback:', data);
            handleRestock(cq.id, cq.message.chat.id, cq.message.message_id, data).catch(e => {
              console.error('handleRestock error:', e.message);
              telegramAnswerCallbackQuery(cq.id, '處理失敗：' + e.message, true).catch(() => {});
            });
          } else if (data && data.startsWith('manual:')) {
            console.log('收到手動輸入 callback:', data);
            handleManual(cq.id, cq.message.chat.id, cq.message.message_id, data).catch(e => {
              console.error('handleManual error:', e.message);
              telegramAnswerCallbackQuery(cq.id, '處理失敗：' + e.message, true).catch(() => {});
            });
          }
        }
        
        // 處理 /alert 指令
        if (update.message && update.message.text) {
          const msg = update.message;
          const chatId = msg.chat.id;
          const text = msg.text.trim();
          
          if (text === '/alert' || text === '/stock') {
            console.log('收到 /alert，執行進貨建議檢查');
            const { spawn } = require('child_process');
            spawn('node', ['/Users/a123/.openclaw/workspace/xianle-stock/check-stock-alert.js'], {
              detached: true, stdio: 'ignore'
            }).unref();
            telegramSendMessage(chatId, '🔄 正在抓取庫存資料，請稍後...').catch(e => {});
          } else if (text && pendingManual.has(String(chatId))) {
            const { store, itemId } = pendingManual.get(String(chatId));
            pendingManual.delete(String(chatId));
            const qty = parseInt(text);
            if (isNaN(qty) || qty <= 0) {
              telegramSendMessage(chatId, '❌ 數量無效，請輸入正整數').catch(e => console.error('發送失敗:', e.message));
            } else {
              handleManualRestock(chatId, store, itemId, qty).catch(e => {
                console.error('handleManualRestock error:', e.message);
                telegramSendMessage(chatId, '❌ 處理失敗：' + e.message).catch(() => {});
              });
            }
          }
        }
      }
    }
  } catch(e) {
    console.error('getUpdates error:', e.message);
  }
}

async function loop() {
  console.log('開始輪詢...');
  while (true) {
    await getUpdates();
    await new Promise(r => setTimeout(r, 1000));
  }
}

loop().catch(e => {
  console.error('Bot loop error:', e.message);
  process.exit(1);
});
