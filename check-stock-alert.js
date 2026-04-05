// check-stock-alert.js
// 使用 Firebase REST API 讀取 Firestore，發送 Telegram 通知

const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'xianle-stock';
const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;

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

// 取得 Firebase Access Token
function getAccessToken() {
  return new Promise((resolve, reject) => {
    if (!FIREBASE_SERVICE_ACCOUNT) {
      reject(new Error('Missing FIREBASE_SERVICE_ACCOUNT'));
      return;
    }

    const creds = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    const jwt = createJWT(creds);
    
    const data = JSON.stringify({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    });

    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.access_token) {
            resolve(result.access_token);
          } else {
            reject(new Error('No access token: ' + body));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 建立 JWT token
function createJWT(creds) {
  const crypto = require('crypto');
  
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;
  
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: creds.client_email,
    sub: creds.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: expiry,
    scope: 'https://www.googleapis.com/auth/cloud-platform'
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const signingInput = `${base64Header}.${base64Payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  
  const privateKey = creds.private_key.replace(/\\n/g, '\n');
  const signature = signer.sign(privateKey, 'base64url');
  
  return `${signingInput}.${signature}`;
}

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

// 讀取 Firestore 文件
async function readFirestoreDoc(accessToken, docPath) {
  return new Promise((resolve, reject) => {
    const projectId = FIREBASE_PROJECT_ID;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}?key=${accessToken}`;
    
    // 注意：使用 API key 或 access token
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${projectId}/databases/(default)/documents/${docPath}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };

    const req = https.request(options, (res) => {
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
    });
    req.on('error', reject);
    req.end();
  });
}

async function checkStockAlerts() {
  console.log('開始檢查庫存...');
  console.log('TIME:', new Date().toISOString());

  let accessToken;
  try {
    accessToken = await getAccessToken();
    console.log('取得 Access Token 成功');
  } catch (e) {
    console.error('取得 Access Token 失敗:', e.message);
    process.exit(1);
  }

  const today = new Date().toISOString().split('T')[0];
  const alerts = [];
  const stores = ['總店', '麥金店'];

  for (const store of stores) {
    const docId = `${store}_${today}`;
    console.log(`檢查 ${store}...`);
    
    try {
      const doc = await readFirestoreDoc(accessToken, docId);
      
      if (doc.fields) {
        // 解析 Firestore 文件
        const items = {};
        if (doc.fields.items && doc.fields.items.mapValue) {
          const itemFields = doc.fields.items.mapValue.fields;
          for (const [key, value] of Object.entries(itemFields)) {
            if (value.integerValue !== undefined) {
              items[key] = parseInt(value.integerValue);
            } else if (value.doubleValue !== undefined) {
              items[key] = parseFloat(value.doubleValue);
            }
          }
        }
        
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
