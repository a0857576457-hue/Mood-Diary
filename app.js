// 初始化資料
let expenses = JSON.parse(localStorage.getItem('expenses')) || [];
let currentViewingDate = new Date();

// DOM 元素引用
const calendarGrid = document.getElementById('calendar-grid');
const currentMonthDisplay = document.getElementById('current-month-display');
const monthlyTotalAmount = document.getElementById('monthly-total-amount');
const categoryBreakdown = document.getElementById('category-breakdown');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');

// Modal 相關
const expenseModal = document.getElementById('expense-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const addExpenseMainBtn = document.getElementById('add-expense-main-btn');
const expenseForm = document.getElementById('expense-form');
const expenseDateInput = document.getElementById('expense-date');
const dailyRecordsContainer = document.getElementById('daily-records');
const dailyRecordsList = document.getElementById('daily-records-list');

// 類別顏色對應
const categoryColors = {
    '飲食': 'var(--cat-food)',
    '交通': 'var(--cat-transport)',
    '娛樂': 'var(--cat-entertainment)',
    '其他': 'var(--cat-other)'
};

// 初始化設定
document.addEventListener('DOMContentLoaded', () => {
    updateView();
    setupEventListeners();
});

// 設定事件監聽器
function setupEventListeners() {
    // 切換月份
    prevMonthBtn.addEventListener('click', () => {
        currentViewingDate.setMonth(currentViewingDate.getMonth() - 1);
        updateView();
    });
    
    nextMonthBtn.addEventListener('click', () => {
        currentViewingDate.setMonth(currentViewingDate.getMonth() + 1);
        updateView();
    });

    // 打開新增/檢視 Modal
    addExpenseMainBtn.addEventListener('click', () => {
        // 預設填入今天日期
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        openModal(`${yyyy}-${mm}-${dd}`);
    });

    closeModalBtn.addEventListener('click', closeModal);
    
    // 點擊背景關閉 Modal
    expenseModal.addEventListener('click', (e) => {
        if (e.target === expenseModal) {
            closeModal();
        }
    });

    expenseForm.addEventListener('submit', handleAddExpense);
}

// 根據 currentViewingDate 更新全部畫面
function updateView() {
    renderCalendar();
    renderSummary();
    currentMonthDisplay.textContent = `${currentViewingDate.getFullYear()} 年 ${currentViewingDate.getMonth() + 1} 月`;
}

// 渲染月曆
function renderCalendar() {
    calendarGrid.innerHTML = '';
    
    const year = currentViewingDate.getFullYear();
    const month = currentViewingDate.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay(); // 本月第一天是星期幾 0-6
    const daysInMonth = new Date(year, month + 1, 0).getDate(); // 本月有幾天
    
    // 填補前面的空白格子
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-cell empty';
        calendarGrid.appendChild(emptyCell);
    }
    
    const today = new Date();
    
    // 渲染日期格子
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        
        // 檢查是否為今天
        if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day) {
            cell.classList.add('today');
        }
        
        // 格式化日期 YYYY-MM-DD
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // 找尋當日所有花費
        const dailyExpenses = expenses.filter(exp => exp.date === dateStr);
        const dailyTotal = dailyExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        
        let cellHTML = `<div class="date">${day}</div>`;
        
        if (dailyTotal > 0) {
            // 金額標籤
            cellHTML += `<div class="daily-total-badge">$${dailyTotal.toLocaleString()}</div>`;
            
            // 下方多筆紀錄小圓點指示
            if (dailyExpenses.length > 0) {
                cellHTML += `<div class="dots-container">`;
                // 最多顯示 4 個小圓點，避免超出格子
                dailyExpenses.slice(0, 4).forEach(exp => {
                    cellHTML += `<div class="small-dot" style="background-color: ${categoryColors[exp.category] || categoryColors['其他']}"></div>`;
                });
                if (dailyExpenses.length > 4) {
                    cellHTML += `<div class="small-dot" style="background-color: #ccc"></div>`; // 還有更多的提示
                }
                cellHTML += `</div>`;
            }
        }
        
        cell.innerHTML = cellHTML;
        
        // 點擊格子打開詳細紀錄及新增表單
        cell.addEventListener('click', () => {
            openModal(dateStr, dailyExpenses);
        });
        
        calendarGrid.appendChild(cell);
    }
}

// 渲染側邊總結
function renderSummary() {
    const year = currentViewingDate.getFullYear();
    const month = currentViewingDate.getMonth();
    const mmStr = String(month + 1).padStart(2, '0');
    
    // 過濾出這個月的紀錄
    const monthlyExpenses = expenses.filter(exp => {
        return exp.date.startsWith(`${year}-${mmStr}`);
    });
    
    const total = monthlyExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    animateValue(monthlyTotalAmount, parseInt(monthlyTotalAmount.textContent.replace(/,/g, '') || 0), total, 600);
    // monthlyTotalAmount.textContent = total.toLocaleString();

    // 計算各類別總額
    const categoryTotals = { '飲食': 0, '交通': 0, '娛樂': 0, '其他': 0 };
    monthlyExpenses.forEach(exp => {
        if (categoryTotals[exp.category] !== undefined) {
            categoryTotals[exp.category] += exp.amount;
        } else {
            categoryTotals['其他'] += exp.amount;
        }
    });

    // 渲染類別統計清單
    categoryBreakdown.innerHTML = '';
    
    // 將類別轉換為陣列並按金額排序
    const sortedCategories = Object.entries(categoryTotals)
        .filter(([cat, amt]) => amt > 0)
        .sort((a, b) => b[1] - a[1]);
        
    if (sortedCategories.length === 0) {
        // 如果這個月還沒有花費
        categoryBreakdown.innerHTML = '<div style="text-align:center;color:var(--text-secondary);margin-top:2rem;font-size:0.9rem;">目前尚無紀錄</br>趕快記下一筆吧！</div>';
        return;
    }

    sortedCategories.forEach(([category, amount]) => {
        const item = document.createElement('div');
        item.className = 'category-item';
        
        // 算出該類別佔比
        const percentage = Math.round((amount / total) * 100) || 0;
        
        item.innerHTML = `
            <div class="cat-label-container">
                <div class="cat-dot" style="background-color: ${categoryColors[category]}"></div>
                <span>${category} <span style="font-size:0.8rem; color:var(--text-secondary); margin-left:4px">${percentage}%</span></span>
            </div>
            <div class="cat-amount">$${amount.toLocaleString()}</div>
        `;
        categoryBreakdown.appendChild(item);
    });
}

// 處理新增花費
function handleAddExpense(e) {
    e.preventDefault();
    
    const date = expenseDateInput.value;
    const categoryInputs = document.getElementsByName('category');
    let category = '其他';
    for (const input of categoryInputs) {
        if (input.checked) {
            category = input.value;
            break;
        }
    }
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const note = document.getElementById('expense-note').value.trim();
    
    const targetDateObj = new Date(date);
    
    const newExpense = {
        id: Date.now().toString(),
        date, // YYYY-MM-DD
        category,
        amount,
        note,
        timestamp: Date.now()
    };
    
    expenses.push(newExpense);
    saveExpenses();
    
    // 檢查記帳日期是否在當前顯示的月份，如果不是，自動切換畫面月份
    if (targetDateObj.getFullYear() !== currentViewingDate.getFullYear() || 
        targetDateObj.getMonth() !== currentViewingDate.getMonth()) {
        currentViewingDate = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), 1);
    }
    
    updateView();
    
    // 如果是從日期格點進來的，我們保持面板開啟並更新底下列表，同時清空表單金額
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-note').value = '';
    renderDailyRecords(date);
}

// 刪除花費
function deleteExpense(id) {
    expenses = expenses.filter(exp => exp.id !== id);
    saveExpenses();
    
    const dateStr = expenseDateInput.value; // 從表單得知當前打開的是哪單日
    renderDailyRecords(dateStr); // 更新列表
    updateView(); // 更新主畫面
}

// 儲存進 LocalStorage
function saveExpenses() {
    localStorage.setItem('expenses', JSON.stringify(expenses));
}

// Modal 邏輯
function openModal(defaultDateStr, dailyExpenses = null) {
    expenseDateInput.value = defaultDateStr;
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-note').value = '';
    
    // 重置單選為預設點擊的項目或第一個
    const categoryInputs = document.getElementsByName('category');
    categoryInputs[0].checked = true; // 預設飲食
    
    // 渲染當日紀錄
    renderDailyRecords(defaultDateStr);
    
    expenseModal.classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('expense-amount').focus();
    }, 100);
}

function closeModal() {
    expenseModal.classList.add('hidden');
}

// 渲染特定日期的所有花費列表於 Modal 中下方
function renderDailyRecords(dateStr) {
    const dailyExpenses = expenses.filter(exp => exp.date === dateStr).sort((a,b) => b.timestamp - a.timestamp);
    
    if (dailyExpenses.length > 0) {
        dailyRecordsContainer.classList.remove('hidden');
        dailyRecordsList.innerHTML = '';
        
        dailyExpenses.forEach(exp => {
            const li = document.createElement('li');
            li.className = 'record-item';
            li.innerHTML = `
                <div class="record-info">
                    <div class="cat-dot" style="background-color: ${categoryColors[exp.category]}"></div>
                    <div class="record-meta">
                        <span class="record-cat">${exp.category}</span>
                        ${exp.note ? `<span class="record-note">${exp.note}</span>` : ''}
                    </div>
                </div>
                <div style="display:flex; align-items:center;">
                    <span class="record-amount">$${exp.amount.toLocaleString()}</span>
                    <button class="record-actions delete-btn" onclick="deleteExpense('${exp.id}')">刪除</button>
                </div>
            `;
            dailyRecordsList.appendChild(li);
        });
    } else {
        dailyRecordsContainer.classList.add('hidden');
    }
}

// 數字跳動動畫副程式
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // easeOutQuart
        const easeProgress = 1 - Math.pow(1 - progress, 4);
        obj.innerHTML = Math.floor(easeProgress * (end - start) + start).toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end.toLocaleString();
        }
    };
    window.requestAnimationFrame(step);
}
