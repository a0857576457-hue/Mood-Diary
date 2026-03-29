import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, where, deleteDoc, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// === Firebase Config (從您的設定複製過來) ===
const firebaseConfig = {
  apiKey: "AIzaSyDd_6kuDOF1JQTRyeb0vVC8ltbzCxa5JAM",
  authDomain: "mood-diary-8c142.firebaseapp.com",
  projectId: "mood-diary-8c142",
  storageBucket: "mood-diary-8c142.firebasestorage.app",
  messagingSenderId: "97269973107",
  appId: "1:97269973107:web:d356c585a245bbf2cc6a06",
  measurementId: "G-6YB8KDE7CL"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ====== 🔒 私人防護設定（白名單） ======
// 請將您與另一半的 Google Email 填入下方
// 如果有人不小心連到這個網頁登入，只要不在名單內就會被自動踢出！
const ALLOWED_EMAILS = [
    "a0857576457@gmail.com",       // 改成您的 Email
    "uniamber384@gmail.com"     // 改成伴侶的 Email
];

// === 全域狀態變數 ===
let currentUser = null;
let profileData = { partnerEmail: "" }; // 存放伴侶設定
let myEntries = []; // 我的紀錄 (包含記帳與心情)
let partnerEntries = []; // 伴侶的紀錄 (只會拉取心情)
let currentViewingDate = new Date(); // 當前察看的月份年月

// 移除原本 localstorage 的變數
// DOM
const loginOverlay = document.getElementById('login-overlay');
const loginContent = document.getElementById('login-content');
const loadingSpinner = document.getElementById('loading-spinner');
const mainApp = document.getElementById('main-app');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

const accountInfo = document.getElementById('account-info');
const partnerSettingBtn = document.getElementById('partner-setting-btn');
const partnerSetupModal = document.getElementById('partner-setup-modal');
const closePartnerBtn = document.getElementById('close-partner-btn');
const partnerEmailInput = document.getElementById('partner-email-input');
const savePartnerBtn = document.getElementById('save-partner-btn');

const calendarGrid = document.getElementById('calendar-grid');
const currentMonthDisplay = document.getElementById('current-month-display');
const monthlyTotalAmount = document.getElementById('monthly-total-amount');
const categoryBreakdown = document.getElementById('category-breakdown');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const shareAppBtn = document.getElementById('share-app-btn');

// Modal 相關
const expenseModal = document.getElementById('expense-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const addExpenseMainBtn = document.getElementById('add-expense-main-btn');
const expenseForm = document.getElementById('expense-form');
const expenseDateInput = document.getElementById('expense-date');
const dailyRecordsContainer = document.getElementById('daily-records');
const dailyRecordsList = document.getElementById('daily-records-list');
const partnerDailyMoodContainer = document.getElementById('partner-daily-mood');

// 類別顏色對應
const categoryColors = {
    '飲食': 'var(--cat-food)',
    '交通': 'var(--cat-transport)',
    '娛樂': 'var(--cat-entertainment)',
    '其他': 'var(--cat-other)'
};

// === 驗證狀態監聽器 ===
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 安全防護：檢查登入的帳號是否有在白名單內
        const userEmail = user.email.toLowerCase();
        if (!ALLOWED_EMAILS.includes(userEmail) && ALLOWED_EMAILS[0] !== "your_email@gmail.com") {
            alert("🔒 抱歉，這是私人的專屬空間，您的帳號無權登入！");
            signOut(auth);
            return;
        }

        currentUser = user;
        loadingSpinner.classList.add('hidden');
        loginOverlay.classList.add('hidden');
        mainApp.classList.remove('hidden');
        accountInfo.innerHTML = `<div>我：${user.email}</div><div>伴侶：載入中...</div>`;
        
        await fetchUserProfile(); // 拉取伴侶設定
        updateView(); // 先直接強制畫初版月曆，避免等待延遲
        setupRealtimeSync(); // 開始監聽資料庫
    } else {
        currentUser = null;
        loginOverlay.classList.remove('hidden');
        mainApp.classList.add('hidden');
        loginContent.classList.remove('hidden');
        loadingSpinner.classList.add('hidden');
        
        // 註銷監聽器 (稍後優化)
        myEntries = [];
        partnerEntries = [];
    }
});

// Google 登入
loginBtn.addEventListener('click', async () => {
    try {
        const provider = new GoogleAuthProvider();
        // 因為您已經將 GitHub 網址加入白名單，我們不用再依賴跳轉了，彈出視窗是最不會被切掉狀態的做法！
        await signInWithPopup(auth, provider);
    } catch (error) {
        alert("登入發生錯誤，請截圖給我看: " + error.message);
    }
});

// 登出
logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

// 伴侶設定 Modal
partnerSettingBtn.addEventListener('click', () => {
    partnerEmailInput.value = profileData.partnerEmail || '';
    partnerSetupModal.classList.remove('hidden');
});
closePartnerBtn.addEventListener('click', () => partnerSetupModal.classList.add('hidden'));

// 儲存伴侶 Email
savePartnerBtn.addEventListener('click', async () => {
    const email = partnerEmailInput.value.trim().toLowerCase();
    const userRef = doc(db, 'users', currentUser.uid);
    try {
        await setDoc(userRef, { partnerEmail: email }, { merge: true });
        profileData.partnerEmail = email;
        accountInfo.innerHTML = `我：${currentUser.email}<br/>伴侶：${email || '尚未綁定'}`;
        partnerSetupModal.classList.add('hidden');
        
        // 重新拉取伴侶資料
        setupRealtimeSync();
    } catch(e) {
        alert("儲存失敗");
    }
});

// 拉取個人設定
async function fetchUserProfile() {
    try {
        const userRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(userRef);
        if(snap.exists()){
            profileData = snap.data();
        }
        accountInfo.innerHTML = `<div>我：${currentUser.email}</div><div>伴侶：${profileData.partnerEmail || '未綁定'}</div>`;
    } catch(e) {
        console.error("讀取設定失敗", e);
        accountInfo.innerHTML = `<div>我：${currentUser.email}</div><div>伴侶：(權限或是連線例外)</div>`;
    }
}

// 設定 Firestore 即時監聽
let myUnsubscribe = null;
let partnerUnsubscribe = null;

function setupRealtimeSync() {
    if(myUnsubscribe) myUnsubscribe();
    if(partnerUnsubscribe) partnerUnsubscribe();
    
    // 監聽我自己的所有紀錄
    const myQ = query(collection(db, 'entries'), where('uid', '==', currentUser.uid));
    myUnsubscribe = onSnapshot(myQ, (snapshot) => {
        myEntries = [];
        snapshot.forEach(doc => {
            myEntries.push({ id: doc.id, ...doc.data() });
        });
        updateView();
    });
    
    // 如果有伴侶，監聽伴侶的心情紀錄
    if(profileData.partnerEmail) {
        const pQ = query(collection(db, 'entries'), where('userEmail', '==', profileData.partnerEmail));
        partnerUnsubscribe = onSnapshot(pQ, (snapshot) => {
            partnerEntries = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                // ※ 重要：基於隱私，我們只在前端暫存對方的心情，丟棄金額
                // (更嚴謹的作法要用 Firebase Security Rules 或 分開 Collection 限制，此處示範簡化)
                partnerEntries.push({ 
                    id: doc.id, 
                    date: data.date, 
                    moodEmoji: data.moodEmoji, 
                    moodMessage: data.moodMessage, 
                    timestamp: data.timestamp
                });
            });
            updateView();
        });
    }
}

// === 畫面更新邏輯 ===
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

function setupEventListeners() {
    prevMonthBtn.addEventListener('click', () => {
        currentViewingDate.setMonth(currentViewingDate.getMonth() - 1);
        updateView();
    });
    nextMonthBtn.addEventListener('click', () => {
        currentViewingDate.setMonth(currentViewingDate.getMonth() + 1);
        updateView();
    });

    addExpenseMainBtn.addEventListener('click', () => {
        // 預設填入今天日期
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        openModal(`${yyyy}-${mm}-${dd}`);
    });

    closeModalBtn.addEventListener('click', closeModal);
    expenseForm.addEventListener('submit', handleAddExpense);
    
    if (shareAppBtn) {
        shareAppBtn.addEventListener('click', async () => {
            if (navigator.share) {
                navigator.share({
                    title: '心情日記',
                    text: '一起來用心網站寫日記跟記帳吧！',
                    url: window.location.href,
                }).catch(e=>console.log(e));
            } else {
                alert('您的裝置不支援分享功能');
            }
        });
    }
}

function updateView() {
    renderCalendar();
    renderSummary();
    currentMonthDisplay.textContent = `${currentViewingDate.getFullYear()} 年 ${currentViewingDate.getMonth() + 1} 月`;
}

function renderCalendar() {
    if(!calendarGrid) return;
    calendarGrid.innerHTML = '';
    
    const year = currentViewingDate.getFullYear();
    const month = currentViewingDate.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-cell empty';
        calendarGrid.appendChild(emptyCell);
    }
    
    const today = new Date();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        
        if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day) {
            cell.classList.add('today');
        }
        
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // 個人當日資料
        const dailyMy = myEntries.filter(e => e.date === dateStr);
        const dailyMyTotal = dailyMy.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const myMood = dailyMy.find(e => e.moodEmoji)?.moodEmoji; // 取當天最後一個有填心情的
        
        // 伴侶當日資料
        const dailyPartner = partnerEntries.filter(e => e.date === dateStr);
        const partnerMood = dailyPartner.find(e => e.moodEmoji)?.moodEmoji;

        let cellHTML = `<div class="date">${day}</div>`;
        
        if (dailyMyTotal > 0) {
            cellHTML += `<div class="daily-total-badge">$${dailyMyTotal.toLocaleString()}</div>`;
        }
        
        // 心情顯示區塊 (右下角放自己，左下角放伴侶)
        if (myMood || partnerMood) {
            cellHTML += `<div style="display:flex; justify-content:space-between; margin-top:auto; font-size:1.2rem; padding: 0 2px;">
                <span title="伴侶心情">${partnerMood || ''}</span>
                <span title="我的心情">${myMood || ''}</span>
            </div>`;
        }
        
        cell.innerHTML = cellHTML;
        
        cell.addEventListener('click', () => {
            openModal(dateStr, dailyMy);
        });
        
        calendarGrid.appendChild(cell);
    }
}

function renderSummary() {
    const year = currentViewingDate.getFullYear();
    const mmStr = String(currentViewingDate.getMonth() + 1).padStart(2, '0');
    
    const monthlyExpenses = myEntries.filter(exp => exp.date.startsWith(`${year}-${mmStr}`) && exp.amount > 0);
    const total = monthlyExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
    
    animateValue(monthlyTotalAmount, parseInt(monthlyTotalAmount.textContent.replace(/,/g, '') || 0), total, 600);

    const categoryTotals = { '飲食': 0, '交通': 0, '娛樂': 0, '其他': 0 };
    monthlyExpenses.forEach(exp => {
        if (categoryTotals[exp.category] !== undefined) {
            categoryTotals[exp.category] += Number(exp.amount);
        } else {
            categoryTotals['其他'] += Number(exp.amount);
        }
    });

    categoryBreakdown.innerHTML = '';
    const sortedCategories = Object.entries(categoryTotals)
        .filter(([, amt]) => amt > 0)
        .sort((a, b) => b[1] - a[1]);
        
    if (sortedCategories.length === 0) {
        categoryBreakdown.innerHTML = '<div style="text-align:center;color:var(--text-secondary);margin-top:2rem;font-size:0.9rem;">本月尚無消費紀錄</div>';
        return;
    }

    sortedCategories.forEach(([category, amount]) => {
        const item = document.createElement('div');
        item.className = 'category-item';
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

// 寫入資料庫
async function handleAddExpense(e) {
    e.preventDefault();
    document.getElementById('submit-record-btn').disabled = true;
    
    const date = expenseDateInput.value;
    
    const moodEmojiInput = document.querySelector('input[name="moodEmoji"]:checked');
    const moodEmoji = moodEmojiInput ? moodEmojiInput.value : '';
    const moodMessage = document.getElementById('mood-message').value.trim();
    
    const categoryInput = document.querySelector('input[name="category"]:checked');
    const category = categoryInput ? categoryInput.value : '其他';
    
    const amountVal = document.getElementById('expense-amount').value;
    const amount = amountVal ? parseFloat(amountVal) : 0;
    
    const newEntry = {
        uid: currentUser.uid,
        userEmail: currentUser.email, // 讓伴侶靠 email 撈取
        date,
        moodEmoji,
        moodMessage,
        category,
        amount,
        timestamp: Date.now()
    };
    
    try {
        await addDoc(collection(db, 'entries'), newEntry);
        // 清空表單
        document.getElementById('expense-amount').value = '';
        document.getElementById('mood-message').value = '';
        // 儲存成功後，最直覺的反饋就是直接關閉視窗，讓使用者看到底下的月曆表情更新！
        closeModal();
    } catch(err) {
        alert("儲存失敗: " + err.message);
    } finally {
        document.getElementById('submit-record-btn').disabled = false;
    }
}

function openModal(defaultDateStr) {
    expenseDateInput.value = defaultDateStr;
    renderDailyRecords(defaultDateStr);
    expenseModal.classList.remove('hidden');
}

function closeModal() {
    expenseModal.classList.add('hidden');
}

// 掛載全域讓 onClick 可以呼叫
window.deleteEntry = async function(id) {
    if(confirm('確定刪除此紀錄嗎？')) {
        await deleteDoc(doc(db, 'entries', id));
    }
}

function renderDailyRecords(dateStr) {
    // 渲染自己的紀錄 (包含金額與心情)
    const dailyMy = myEntries.filter(exp => exp.date === dateStr).sort((a,b) => b.timestamp - a.timestamp);
    
    if (dailyMy.length > 0) {
        dailyRecordsContainer.classList.remove('hidden');
        dailyRecordsList.innerHTML = '';
        
        dailyMy.forEach(exp => {
            const li = document.createElement('li');
            li.className = 'record-item';
            li.innerHTML = `
                <div class="record-info">
                    <div style="font-size:1.2rem; min-width: 25px;">${exp.moodEmoji || ''}</div>
                    <div class="record-meta">
                        ${exp.amount > 0 ? `<span class="record-cat" style="color:${categoryColors[exp.category]}">${exp.category}</span>` : '<span class="record-cat">心情</span>'}
                        ${exp.moodMessage ? `<span class="record-note" style="color:var(--primary-color)">對話：${exp.moodMessage}</span>` : ''}
                    </div>
                </div>
                <div style="display:flex; align-items:center;">
                    ${exp.amount > 0 ? `<span class="record-amount">$${exp.amount.toLocaleString()}</span>` : ''}
                    <button class="record-actions delete-btn" onclick="deleteEntry('${exp.id}')">刪除</button>
                </div>
            `;
            dailyRecordsList.appendChild(li);
        });
    } else {
        dailyRecordsContainer.classList.add('hidden');
    }

    // 渲染另一半的「心情留言」
    partnerDailyMoodContainer.innerHTML = '';
    const dailyPartner = partnerEntries.filter(exp => exp.date === dateStr && exp.moodEmoji).sort((a,b) => b.timestamp - a.timestamp);
    if(dailyPartner.length > 0) {
        let html = `<strong>另一半（${profileData.partnerEmail}）：</strong><br/>`;
        dailyPartner.forEach(p => {
            html += `<div style="margin-top:0.5rem">
                <span style="font-size:1.2rem">${p.moodEmoji}</span> ${p.moodMessage ? `"${p.moodMessage}"` : '（有心情波動但沒留下訊息）'}
            </div>`;
        });
        partnerDailyMoodContainer.innerHTML = html;
        partnerDailyMoodContainer.style.display = 'block';
        dailyRecordsContainer.classList.remove('hidden'); // 如果只有伴侶有留言也要顯示容器
    } else {
        partnerDailyMoodContainer.style.display = 'none';
    }
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
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
