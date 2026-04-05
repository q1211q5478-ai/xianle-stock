// ===== 設定 =====
const SPREADSHEET_ID = '1EZG-wwb4o8aLcKd8MuEh1DWyZM1RFqpPPTyLWfGAFd4';
const API_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyUqgTS1bnddKR9-Ca4bti-aT6VPpmJXlYbmSzFW1hsUJQZaxaKrOJbeUZ2D2zD33Lqcg/exec';

// ===== 品項資料（需與 Sheets 同步）=====
const ITEMS = {
  daily: [
    { id: 'D001', cn: '雞腿', vi: 'Đùi gà', unit: '盒' },
    { id: 'D002', cn: '雞翅', vi: 'Cánh gà', unit: '盒' },
    { id: 'D003', cn: '雞塊', vi: 'Khối gà', unit: '盒' },
    { id: 'D004', cn: '鹹酥雞', vi: 'Gà muối', unit: '包' },
    { id: 'D005', cn: '薯條', vi: 'Khoai tây', unit: '包' },
    { id: 'D006', cn: '地瓜', vi: 'Khoai lang', unit: '包' },
    { id: 'D007', cn: '銀絲捲', vi: 'Cuộn bạc', unit: '包' },
    { id: 'D008', cn: '甜不辣', vi: 'Tempura', unit: '包' },
    { id: 'D009', cn: '天婦羅', vi: 'Tempura Nhật', unit: '包' },
    { id: 'D010', cn: '裹粉', vi: 'Bột tẩm', unit: '包' },
    { id: 'D011', cn: '脆皮粉', vi: 'Bột giòn', unit: '包' },
    { id: 'D012', cn: '胡椒粉', vi: 'Tiêu bột', unit: '罐' },
    { id: 'D013', cn: '梅粉', vi: 'Bột mè', unit: '罐' },
    { id: 'D014', cn: '回鍋油', vi: 'Dầu tái chế', unit: '公升' },
    { id: 'D015', cn: '新油', vi: 'Dầu mới', unit: '公升' },
  ],
  weekly: [
    { id: 'W001', cn: '魚漿', vi: 'Bột cá', unit: '公斤' },
    { id: 'W002', cn: '天婦羅皮', vi: 'Vỏ tempura', unit: '包' },
    { id: 'W003', cn: '甜不辣糊', vi: 'Bột tempura', unit: '公斤' },
    { id: 'W004', cn: '包蛋黑輪', vi: 'Trứng bọc', unit: '條' },
    { id: 'W005', cn: '牛蒡天婦羅', vi: 'Tempura củ cải', unit: '包' },
    { id: 'W006', cn: '小卷天婦羅', vi: 'Tempura mực', unit: '包' },
    { id: 'W007', cn: '魷魚天婦羅', vi: 'Tempura mực ống', unit: '包' },
    { id: 'W008', cn: '花枝天婦羅', vi: 'Tempura bạch văn', unit: '包' },
  ]
};

// ===== 狀態 =====
let currentStore = '總店';
let currentItem = null;
let stockData = {}; // 從 Sheets 載入的庫存資料

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  renderItems();
  loadStockData();
  loadHistory();
});

// ===== 選擇店別 =====
function selectStore(store) {
  currentStore = store;
  document.querySelectorAll('.store-tab').forEach(tab => {
    tab.classList.toggle('active', tab.querySelector('.name').textContent === store);
  });
  currentItem = null;
  updateSubmitBtn();
  updateStockDisplay();
}

// ===== 渲染品項清單 =====
function renderItems() {
  const grid = document.getElementById('item-grid');
  const allItems = [...ITEMS.daily, ...ITEMS.weekly];
  
  grid.innerHTML = allItems.map(item => `
    <div class="item-btn" data-id="${item.id}" onclick="selectItem('${item.id}')">
      <div class="cn">${item.cn}</div>
      <div class="vi">${item.vi}</div>
    </div>
  `).join('');
}

// ===== 選擇品項 =====
function selectItem(itemId) {
  const allItems = [...ITEMS.daily, ...ITEMS.weekly];
  currentItem = allItems.find(i => i.id === itemId);
  
  document.querySelectorAll('.item-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.id === itemId);
  });
  
  // 顯示單位
  document.getElementById('unit-display').textContent = currentItem.unit;
  
  updateSubmitBtn();
  updateStockDisplay();
}

// ===== 更新庫存顯示 =====
function updateStockDisplay() {
  const display = document.getElementById('stock-display');
  if (!currentItem) {
    display.innerHTML = '請先選擇品項';
    return;
  }
  
  const key = `${currentStore}-${currentItem.id}`;
  const stock = stockData[key];
  
  if (stock !== undefined) {
    display.innerHTML = `目前系統存量：<strong>${stock}</strong> ${currentItem.unit}`;
  } else {
    display.innerHTML = '尚無系統記錄';
  }
}

// ===== 更新送出按鈕狀態 =====
function updateSubmitBtn() {
  const btn = document.getElementById('submit-btn');
  btn.disabled = !currentItem || !document.getElementById('stock-input').value;
}

// ===== 從 Sheets 載入庫存資料 =====
async function loadStockData() {
  try {
    const response = await fetch(`${API_SCRIPT_URL}?action=getStock&store=${encodeURIComponent(currentStore)}`);
    const data = await response.json();
    stockData = data;
    updateStockDisplay();
  } catch (e) {
    console.log('尚未設定 API，或載入失敗:', e.message);
    // 使用示範資料
    stockData = {
      '總店-D001': 25,
      '總店-D002': 18,
      '總店-D003': 12,
      '總店-D004': 22,
      '總店-D005': 15,
      '麥金店-D001': 20,
      '麥金店-D002': 15,
      '麥金店-D004': 18,
    };
    updateStockDisplay();
  }
}

// ===== 提交庫存 =====
async function submitStock() {
  if (!currentItem || !currentStore) return;
  
  const input = document.getElementById('stock-input');
  const value = parseFloat(input.value);
  const statusBar = document.getElementById('status-bar');
  const btn = document.getElementById('submit-btn');
  
  if (!value || value < 0) {
    statusBar.className = 'status-bar error';
    statusBar.textContent = '請輸入有效的數量';
    return;
  }
  
  btn.disabled = true;
  statusBar.className = 'status-bar';
  statusBar.textContent = '送出中...';
  
  try {
    const response = await fetch(API_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateStock',
        store: currentStore,
        itemId: currentItem.id,
        value: value
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      statusBar.className = 'status-bar success';
      statusBar.textContent = `✅ 已更新：${currentStore} ${currentItem.cn} = ${value} ${currentItem.unit}`;
      
      // 更新本地資料
      const key = `${currentStore}-${currentItem.id}`;
      stockData[key] = value;
      
      // 清空輸入
      input.value = '';
      currentItem = null;
      document.querySelectorAll('.item-btn').forEach(b => b.classList.remove('selected'));
      updateStockDisplay();
      
      // 加入歷史紀錄
      addHistory(currentStore, currentItem ? currentItem.cn : '?', value, currentItem ? currentItem.unit : '');
      
      setTimeout(() => { statusBar.textContent = ''; }, 3000);
    } else {
      throw new Error(result.error || '更新失敗');
    }
  } catch (e) {
    statusBar.className = 'status-bar error';
    statusBar.textContent = '❌ 更新失敗：' + e.message;
    btn.disabled = false;
  }
  
  btn.disabled = false;
}

// 輸入監聽
document.getElementById('stock-input').addEventListener('input', updateSubmitBtn);

// ===== 歷史紀錄 =====
function loadHistory() {
  const history = JSON.parse(localStorage.getItem('stockHistory') || '[]');
  renderHistory(history);
}

function addHistory(store, item, value, unit) {
  const history = JSON.parse(localStorage.getItem('stockHistory') || '[]');
  history.unshift({
    time: new Date().toLocaleString('zh-TW'),
    store,
    item,
    value,
    unit
  });
  if (history.length > 20) history.pop();
  localStorage.setItem('stockHistory', JSON.stringify(history));
  renderHistory(history);
}

function renderHistory(history) {
  const container = document.getElementById('history-list');
  if (history.length === 0) {
    container.innerHTML = '<div class="card-title">📋 最近填報紀錄</div><div style="color:#888;font-size:13px;text-align:center;padding:20px;">尚無紀錄</div>';
    return;
  }
  
  container.innerHTML = '<div class="card-title">📋 最近填報紀錄</div>' + history.slice(0, 10).map(h => `
    <div class="history-item">
      <span>${h.store} ${h.item}</span>
      <span class="val">${h.value} ${h.unit}</span>
      <span class="time">${h.time}</span>
    </div>
  `).join('');
}

// ===== 頁面切換 =====
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  if (page === 'report') {
    document.getElementById('page-report').classList.add('active');
    document.querySelectorAll('.nav-item')[0].classList.add('active');
  } else {
    document.getElementById('page-overview').classList.add('active');
    document.querySelectorAll('.nav-item')[1].classList.add('active');
    loadOverview();
  }
}

// ===== 總覽頁面載入 =====
async function loadOverview() {
  const alertDiv = document.getElementById('alert-list');
  alertDiv.innerHTML = '<div style="color:#888;text-align:center;">載入中...</div>';
  
  try {
    // 示範顯示低庫存警示
    alertDiv.innerHTML = `
      <div style="color:#888;font-size:13px;">
        ⚠️ 總店：雞腿 20盒（安全存量 20）<br>
        🔴 麥金店：裹粉 8包（安全存量 10）
      </div>
    `;
  } catch (e) {
    alertDiv.innerHTML = '<div style="color:#888;">載入失敗</div>';
  }
}

// ===== 安裝提示 =====
if ('standalone' in navigator === false) {
  document.write(`
    <div id="install-hint" style="
      position: fixed;
      bottom: 80px;
      left: 16px;
      right: 16px;
      background: #333;
      color: white;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 13px;
      text-align: center;
      z-index: 999;
    ">
      📱 按右上角 <b>分享</b> → <b>加到主畫面</b> 可安裝 App
      <span onclick="document.getElementById('install-hint').remove()" style="float:right;cursor:pointer;">✕</span>
    </div>
  `);
}
