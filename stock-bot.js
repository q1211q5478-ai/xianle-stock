#!/usr/bin/env node
// stock-bot.js
// 庫存 Bot：處理補貨回覆按鈕 + 手動查詢指令
// 使用方式：node stock-bot.js

const https = require('https');

const TELEGRAM_BOT_TOKEN = '8646998739:AAEkF4NYn7xipfuvAJwbQ6xonP8tSU7jg1M';
const TELEGRAM_CHAT_ID = '8614627016';
const FIREBASE_PROJECT_ID = 'xianle-stock';
const FIREBASE_API_KEY = 'AIzaSyAaHj8E5WWQrllzqZC7OvrYsybhnFbm1T4';
const STOCK_COLLECTION = 'stock';
const LOG_COLLECTION = 'stock_log';

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
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function firestorePatchDoc(collection, docId, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ fields: data });
    const docPath = `${collection}/${docId}`;
    const fieldPaths = Object.keys(data).join(',');
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=${fieldPaths}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function firestoreAddDoc(collection, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ fields: data });
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}?key=${FIREBASE_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ========== Telegram API ==========
function telegramRequest(method, params) {
  return new Promise((resolve, reject) => {
    const query = Object.entries(params || {}).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/${method}${query ? '?'+query : ''}`,
      method: 'GET'
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function telegramAnswerCallbackQuery(callbackQueryId, text, showAlert = false) {
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text,
    show_alert: showAlert
  });
}

function telegramEditMessageReplyMarkup(chatId, messageId, inlineKeyboard) {
  return telegramRequest('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: JSON.stringify({ inline_keyboard: inlineKeyboard })
  });
}

// ========== 處理補貨回覆 ==========
async function handleRestock(callbackQueryId, chatId, messageId, data) {
  const parts = data.split(':');
  if (parts.length !== 4) return;
  
  const [, store, itemId, qtyStr] = parts;
  const qty = parseInt(qtyStr);
  if (isNaN(qty) || qty <= 0) {
    await telegramAnswerCallbackQuery(callbackQueryId, '數量無效', true);
    return;
  }
  
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
        },
        orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESC' }],
        limit: 1
      }
    };
    const results = await firestoreRunQuery(query);
    if (results[0]?.document) {
      const fields = results[0].document.fields;
      const itemField = fields[`items.${itemId}`];
      if (itemField) {
        currentQty = parseInt(itemField.integerValue || itemField.doubleValue || 0);
      }
    }
  } catch(e) {
    await telegramAnswerCallbackQuery(callbackQueryId, '查詢失敗：' + e.message, true);
    return;
  }
  
  const newQty = currentQty + qty;
  
  try {
    await firestorePatchDoc(STOCK_COLLECTION, `${store}_${today}`, {
      [`items.${itemId}`]: { integerValue: String(newQty) },
      updatedAt: { timestampValue: new Date().toISOString() }
    });
  } catch(e) {
    // 文件不存在，先建立
    try {
      await firestoreAddDoc(STOCK_COLLECTION, {
        store: { stringValue: store },
        date: { stringValue: today },
        [`items.${itemId}`]: { integerValue: String(newQty) },
        updatedAt: { timestampValue: new Date().toISOString() }
      });
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
  
  const newKeyboard = [[{ text: `✅ 已補貨 ＋${qty}`, callback_data: 'done' }]];
  await telegramEditMessageReplyMarkup(chatId, messageId, newKeyboard);
  await telegramAnswerCallbackQuery(callbackQueryId, `✅ 已更新！${itemId}：${currentQty} → ${newQty}`);
}

// ========== Polling Loop ==========
let offset = 0;

async function poll() {
  try {
    const result = await telegramRequest('getUpdates', { offset, timeout: 30 });
    if (!result.ok || !result.result.length) {
      setTimeout(poll, 1000);
      return;
    }
    
    for (const update of result.result) {
      offset = update.update_id + 1;
      
      if (update.callback_query) {
        const cq = update.callback_query;
        const data = cq.data;
        
        if (data === 'done') {
          await telegramAnswerCallbackQuery(cq.id, '這項已補過了');
          continue;
        }
        
        if (data.startsWith('restock:')) {
          await handleRestock(cq.id, cq.message.chat.id, cq.message.message_id, data);
          continue;
        }
        
        if (data.startsWith('custom:')) {
          await telegramAnswerCallbackQuery(cq.id, '請直接回覆數量，例如：+15', true);
          continue;
        }
      }
      
      // 文字訊息
      if (update.message && update.message.text && update.message.chat.id.toString() === TELEGRAM_CHAT_ID) {
        const text = update.message.text.trim();
        const match = text.match(/^[+]?(\\d+)$/);
        if (match) {
          const qty = parseInt(match[1]);
          await telegramRequest('sendMessage', {
            chat_id: TELEGRAM_CHAT_ID,
            text: `📝 收到數量 ${qty}！\\n\\n請告訴我要補哪個品項，格式：\\n品項ID 數量\\n\\n例如：D001 10`
          });
        }
      }
    }
  } catch(e) {
    console.error('Poll error:', e.message);
  }
  
  setTimeout(poll, 1000);
}

console.log('🟢 庫存 Bot 啟動中...');
poll();
