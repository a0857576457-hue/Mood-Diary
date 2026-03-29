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

// ====== 🎵 UI 音效系統 ======
let audioCtx = null;
function initAudio() {
    if(!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if(audioCtx.state === 'suspended') audioCtx.resume();
}

function playTapSound() {
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    } catch(e) {}
}

function playSuccessSound() {
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.08); // 輕快往上的和弦
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } catch(e) {}
}

// 全域監聽點擊，給予清脆的回饋音效
document.addEventListener('click', (e) => {
    // 只要是按鈕、標籤、日曆格子就發出短暫音效
    const target = e.target.closest('button, .calendar-cell, .radio-label, .close-btn, .nav-btn, input[type="radio"]');
    if (target) {
        playTapSound();
    }
}, { capture: true });


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

let editingEntryId = null; 

const accountInfo = document.getElementById('account-info');

const megaphoneBtn = document.getElementById('megaphone-btn');
const megaphoneModal = document.getElementById('megaphone-modal');
const closeMegaphoneBtn = document.getElementById('close-megaphone-btn');
const myMegaphoneInput = document.getElementById('my-megaphone-input');
const partnerMegaphoneText = document.getElementById('partner-megaphone-text');
const saveMegaphoneBtn = document.getElementById('save-megaphone-btn');
const partnerSettingBtn = document.getElementById('partner-setting-btn');
const partnerSetupModal = document.getElementById('partner-setup-modal');
const closePartnerBtn = document.getElementById('close-partner-btn');
const partnerEmailInput = document.getElementById('partner-email-input');
const savePartnerBtn = document.getElementById('save-partner-btn');
const enableNotificationCheckbox = document.getElementById('enable-notification-checkbox');

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

// Game Modal 相關
const gameBtn = document.getElementById('game-btn');
const gameModal = document.getElementById('game-modal');
const closeGameBtn = document.getElementById('close-game-btn');
const dCanvas = document.getElementById('drawing-canvas');
const guessImage = document.getElementById('guess-image');
const drawerTools = document.getElementById('drawer-tools');
const drawerInputZone = document.getElementById('drawer-input-zone');
const guesserInputZone = document.getElementById('guesser-input-zone');
const gameStatusText = document.getElementById('game-status-text');
const gameTimerDisplay = document.getElementById('game-timer-display');
const gameLastResult = document.getElementById('game-last-result');
const gameAnswerInput = document.getElementById('game-answer-input');
const gameGuessInput = document.getElementById('game-guess-input');
const submitDrawingBtn = document.getElementById('submit-drawing-btn');
const submitGuessBtn = document.getElementById('submit-guess-btn');

// 類別顏色對應
const categoryColors = {
    '飲食': 'var(--cat-food)',
    '交通': 'var(--cat-transport)',
    '娛樂': 'var(--cat-entertainment)',
    '薪資': '#2ecc71',
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
    enableNotificationCheckbox.checked = profileData.enableNotifications || false;
    partnerSetupModal.classList.remove('hidden');
    history.pushState({ modal: 'partner' }, '', '#partner');
});
closePartnerBtn.addEventListener('click', () => {
    partnerSetupModal.classList.add('hidden');
    if (location.hash === '#partner') history.back();
});

// 儲存伴侶 Email
savePartnerBtn.addEventListener('click', async () => {
    const email = partnerEmailInput.value.trim().toLowerCase();
    const enableNotif = enableNotificationCheckbox.checked;
    
    // 如果勾選了，但尚未授權系統通知，就要求授權
    if (enableNotif && "Notification" in window && Notification.permission !== "granted") {
        await Notification.requestPermission();
    }
    
    const userRef = doc(db, 'users', currentUser.uid);
    try {
        await setDoc(userRef, { partnerEmail: email, enableNotifications: enableNotif }, { merge: true });
        profileData.partnerEmail = email;
        profileData.enableNotifications = enableNotif;
        accountInfo.innerHTML = `我：${currentUser.email}<br/>伴侶：${email || '尚未綁定'}`;
        
        playSuccessSound(); // 伴侶綁定成功音效
        
        partnerSetupModal.classList.add('hidden');
        if (location.hash === '#partner') history.back();
        
        // 重新拉取伴侶資料
        setupRealtimeSync();
    } catch(e) {
        alert("儲存失敗");
    }
});

// === 悄悄話功能 ===
megaphoneBtn.addEventListener('click', async () => {
    renderMegaphones(); // 點開時確保顯示最新內容
    megaphoneModal.classList.remove('hidden');
    history.pushState({ modal: 'megaphone' }, '', '#megaphone');
    
    // 消掉小紅點
    megaphoneBtn.innerHTML = '🤫 悄悄話';

    // 【閱後即焚】如果對方有留言，我看過之後就幫他從資料庫抹除
    const pMega = partnerEntries.find(e => e.isMegaphone);
    if (pMega && pMega.megaphoneText) {
        try {
            await setDoc(doc(db, 'entries', pMega.id), { megaphoneText: '' }, { merge: true });
        } catch (e) {
            console.error("清除留言失敗: ", e);
        }
    }
});

closeMegaphoneBtn.addEventListener('click', () => {
    megaphoneModal.classList.add('hidden');
    if (location.hash === '#megaphone') history.back();
});

saveMegaphoneBtn.addEventListener('click', async () => {
    saveMegaphoneBtn.disabled = true;
    const text = myMegaphoneInput.value.trim();
    const megaRef = doc(db, 'entries', `mega_${currentUser.uid}`);
    try {
        await setDoc(megaRef, {
            uid: currentUser.uid,
            userEmail: currentUser.email,
            isMegaphone: true,
            megaphoneText: text,
            timestamp: Date.now()
        }, { merge: true });
        
        playSuccessSound(); // 悄悄話送出成功音效
        
        megaphoneModal.classList.add('hidden');
        if (location.hash === '#megaphone') history.back();
    } catch(err) {
        alert('廣播失敗: ' + err.message);
    } finally {
        saveMegaphoneBtn.disabled = false;
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

// ====== 通知推播功能 ======
window.showWhisperNotification = function() {
    // 瀏覽器系統通知
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("🤫 收到新悄悄話！", {
            body: "伴侶剛剛留了一則悄悄話給您哦～",
        });
    }
    
    // 好看的漂浮 Toast 彈出視窗
    const toast = document.createElement('div');
    toast.innerHTML = `
        <div style="position:fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #2a2a2a; color: white; padding: 12px 24px; border-radius: 30px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 9999; display: flex; align-items: center; gap: 10px; font-weight: bold; animation: slideDown 0.3s ease-out;">
            <span style="font-size:1.5rem">🤫</span>
            <span>伴侶傳來了新的悄悄話！</span>
            <button onclick="document.getElementById('megaphone-btn').click(); this.parentElement.remove();" style="background: var(--primary-color); color: white; border: none; padding: 6px 12px; border-radius: 15px; cursor: pointer; font-size: 0.85rem; margin-left:10px; font-weight:bold;">點擊查看</button>
        </div>
    `;
    document.body.appendChild(toast);
    
    // 5 秒後自動消失
    setTimeout(() => {
        if(toast.parentElement) toast.remove();
    }, 5000);
};

// 設定 Firestore 即時監聽
let myUnsubscribe = null;
let partnerUnsubscribe = null;
let lastSeenWhisperText = null;
let isPartnerFirstLoad = true;

function setupRealtimeSync() {
    if(myUnsubscribe) myUnsubscribe();
    if(partnerUnsubscribe) partnerUnsubscribe();
    
    isPartnerFirstLoad = true;
    lastSeenWhisperText = null;
    
    // 啟動你畫我猜的同步
    setupGameSync();
    
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
                
                let safeAmount = data.amount;
                // 若對方選擇的是鈔票 💵，則對我方隱藏實際消費金額 (視為 0)
                if (data.moodEmoji === '💵') {
                    safeAmount = 0;
                }
                
                partnerEntries.push({ 
                    id: doc.id, 
                    date: data.date, 
                    type: data.type,
                    amount: safeAmount,
                    category: data.category,
                    moodEmoji: data.moodEmoji, 
                    moodMessage: data.moodMessage, 
                    timestamp: data.timestamp,
                    isMegaphone: data.isMegaphone,
                    megaphoneText: data.megaphoneText
                });
            });
            
            // 通知判斷邏輯
            const pMega = partnerEntries.find(e => e.isMegaphone);
            const currentWhisper = pMega && pMega.megaphoneText ? pMega.megaphoneText : null;
            
            if (isPartnerFirstLoad) {
                // 初次載入，只同步狀態，不播通知
                lastSeenWhisperText = currentWhisper;
                isPartnerFirstLoad = false;
            } else if (currentWhisper !== lastSeenWhisperText) {
                // 有被更動過狀態，且是新訊息 (非清空狀態)，且用戶開啟了通知
                if (currentWhisper && profileData.enableNotifications) {
                    window.showWhisperNotification();
                }
                lastSeenWhisperText = currentWhisper;
            }
            
            updateView();
        });
    }
}

// === 畫面更新邏輯 ===
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initGameSystem();
    
    // 攔截手機返回鍵 (PopState)
    window.addEventListener('popstate', (e) => {
        // 如果表單是開著的 (沒隱藏)，那就關掉它，不要離開 App
        if (!expenseModal.classList.contains('hidden')) {
            expenseModal.classList.add('hidden');
        }
        if (!partnerSetupModal.classList.contains('hidden')) {
            partnerSetupModal.classList.add('hidden');
        }
        if (!megaphoneModal.classList.contains('hidden')) {
            megaphoneModal.classList.add('hidden');
        }
    });
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
    
    // 當使用者在對話框內手動修改了日期時，上面顯示的「當日紀錄」也應該馬上跟著換天！
    expenseDateInput.addEventListener('change', (e) => {
        const newDateStr = e.target.value;
        if (newDateStr) {
            renderDailyRecords(newDateStr);
        }
    });

    // 切換收支類型時，動態切換底下的分類選項
    const expenseTypeRadios = document.querySelectorAll('input[name="expenseType"]');
    const expenseCategoryGroup = document.getElementById('expense-category-group');
    const incomeCategoryGroup = document.getElementById('income-category-group');
    const customCatGroup = document.getElementById('custom-category-group');
    const customCatInput = document.getElementById('custom-category-input');
    
    // 檢查「其他」的出現時機，並連動文字框
    function checkCustomCategory() {
        const type = document.querySelector('input[name="expenseType"]:checked')?.value || 'expense';
        let isOther = false;
        if (type === 'income') {
            const incCat = document.querySelector('input[name="incomeCategory"]:checked');
            if (incCat && incCat.value === '其他') isOther = true;
        } else {
            const expCat = document.querySelector('input[name="category"]:checked');
            if (expCat && expCat.value === '其他') isOther = true;
        }
        
        if (isOther) {
            customCatGroup.classList.remove('hidden');
        } else {
            customCatGroup.classList.add('hidden');
        }
    }

    // 監聽類別切換
    document.querySelectorAll('input[name="category"], input[name="incomeCategory"]').forEach(r => {
        r.addEventListener('change', checkCustomCategory);
    });

    expenseTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'income') {
                expenseCategoryGroup.classList.add('hidden');
                incomeCategoryGroup.classList.remove('hidden');
            } else {
                expenseCategoryGroup.classList.remove('hidden');
                incomeCategoryGroup.classList.add('hidden');
            }
            checkCustomCategory();
        });
    });
    
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
    renderMegaphones();
    currentMonthDisplay.textContent = `${currentViewingDate.getFullYear()} 年 ${currentViewingDate.getMonth() + 1} 月`;
}

function renderMegaphones() {
    if (!myMegaphoneInput || !partnerMegaphoneText) return;
    
    // 渲染我發出去的大聲公 (如果對方看過並清空了，這裡也會變空，形同「已讀提示」)
    const myMega = myEntries.find(e => e.isMegaphone);
    if (myMega && document.activeElement !== myMegaphoneInput) {
        myMegaphoneInput.value = myMega.megaphoneText || '';
    }
    
    const pMega = partnerEntries.find(e => e.isMegaphone);

    // 如果沒打開信箱，且有新留言，就亮起小紅點通知
    if (pMega && pMega.megaphoneText && megaphoneModal.classList.contains('hidden')) {
        megaphoneBtn.innerHTML = '🤫 悄悄話 <span style="background:red;width:8px;height:8px;border-radius:50%;display:inline-block;margin-left:4px;"></span>';
    } else {
        megaphoneBtn.innerHTML = '🤫 悄悄話';
    }
    
    // 如果小視窗現在開著，千萬不能馬上覆蓋掉畫面上的字 (因為背景正在執行閱後即焚)
    if (!megaphoneModal.classList.contains('hidden')) {
        return;
    }

    if (pMega && pMega.megaphoneText) {
        partnerMegaphoneText.textContent = pMega.megaphoneText;
    } else {
        partnerMegaphoneText.textContent = '尚無留言';
    }
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
        const dailyExp = dailyMy.filter(e => !e.type || e.type === 'expense').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const dailyInc = dailyMy.filter(e => e.type === 'income').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const dailyNet = dailyInc - dailyExp;
        
        const myLastMoodEntry = dailyMy.find(e => e.moodEmoji);
        const myMood = myLastMoodEntry ? myLastMoodEntry.moodEmoji : '';
        const myHasMsg = myLastMoodEntry && myLastMoodEntry.moodMessage ? '<span style="font-size:0.8rem; vertical-align: top;">💬</span>' : '';
        
        // 伴侶當日資料
        const dailyPartner = partnerEntries.filter(e => e.date === dateStr && !e.isMegaphone);
        const partnerLastMoodEntry = dailyPartner.find(e => e.moodEmoji);
        const partnerMood = partnerLastMoodEntry ? partnerLastMoodEntry.moodEmoji : '';
        const partnerHasMsg = partnerLastMoodEntry && partnerLastMoodEntry.moodMessage ? '<span style="font-size:0.8rem; vertical-align: top; margin-left:1px;">💬</span>' : '';
        
        let cellHTML = `<div class="date">${day}</div>`;
        const dotsHTML = [];
        
        // 個人消費點點
        dailyMy.forEach(e => {
            if (e.amount > 0) {
                dotsHTML.push(`<div class="small-dot" style="background-color: ${categoryColors[e.category] || '#aaa'};"></div>`);
            }
        });

        // 伴侶消費點點
        dailyPartner.forEach(e => {
            if (e.amount > 0) {
                dotsHTML.push(`<div class="small-dot" style="background-color: ${categoryColors[e.category] || '#aaa'}; border: 1px solid #d63384;"></div>`);
            }
        });
        
        if (dotsHTML.length > 0) {
            cellHTML += `<div class="dots-container" style="margin-top:2px; flex-wrap:wrap; padding: 0 2px;">${dotsHTML.slice(0, 8).join('')}</div>`;
        }
        
        // 心情顯示區塊 (右下角放自己，左下角放伴侶)
        if (myMood || partnerMood) {
            cellHTML += `<div style="display:flex; justify-content:space-between; margin-top:auto; font-size:1.3rem; padding: 0 2px;">
                <span title="伴侶心情">${partnerMood}${partnerHasMsg}</span>
                <span title="我的心情">${myMood}${myHasMsg}</span>
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
    
    const monthlyItems = myEntries.filter(exp => exp.date && exp.date.startsWith(`${year}-${mmStr}`) && exp.amount > 0);
    const monthlyExpenses = monthlyItems.filter(exp => !exp.type || exp.type === 'expense');
    const monthlyIncomes = monthlyItems.filter(exp => exp.type === 'income');
    
    const totalExp = monthlyExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
    const totalInc = monthlyIncomes.reduce((sum, exp) => sum + Number(exp.amount), 0);
    const totalNet = totalInc - totalExp;
    
    monthlyTotalAmount.textContent = totalNet.toLocaleString();
    monthlyTotalAmount.style.color = totalNet >= 0 ? '#2a2a2a' : 'var(--primary-color)';
    
    const incomeSpan = document.getElementById('monthly-income');
    const expenseSpan = document.getElementById('monthly-expense');
    if (incomeSpan) incomeSpan.textContent = `$${totalInc.toLocaleString()}`;
    if (expenseSpan) expenseSpan.textContent = `$${totalExp.toLocaleString()}`;

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
        
    const pieChart = document.getElementById('expense-pie-chart');
    if (pieChart) {
        if (sortedCategories.length > 0 && totalExp > 0) {
            let gradientStops = [];
            let currentPct = 0;
            sortedCategories.forEach(([cat, amt]) => {
                const pct = (amt / totalExp) * 100;
                const color = categoryColors[cat] || 'var(--cat-other)';
                gradientStops.push(`${color} ${currentPct}% ${currentPct + pct}%`);
                currentPct += pct;
            });
            pieChart.style.background = `conic-gradient(${gradientStops.join(', ')})`;
            pieChart.style.display = 'block';
        } else {
            pieChart.style.display = 'none';
        }
    }

    if (sortedCategories.length === 0) {
        if (pieChart) pieChart.style.display = 'none';
        categoryBreakdown.innerHTML = '<div style="text-align:center;color:var(--text-secondary);margin-top:2rem;font-size:0.9rem;">本月尚無消費紀錄</div>';
        return;
    }

    sortedCategories.forEach(([category, amount]) => {
        const item = document.createElement('div');
        item.className = 'category-item';
        const percentage = Math.round((amount / totalExp) * 100) || 0;
        item.innerHTML = `
            <div class="cat-label-container">
                <div class="cat-dot" style="background-color: ${categoryColors[category] || 'var(--cat-other)'}"></div>
                <span>${category} <span style="font-size:0.8rem; color:var(--text-secondary); margin-left:4px">${percentage}%</span></span>
            </div>
            <div class="cat-amount">$${amount.toLocaleString()}</div>
        `;
        item.style.padding = '0.6rem 0.8rem';
        item.style.marginBottom = '0.5rem';
        categoryBreakdown.appendChild(item);
    });
}

// 寫入資料庫
async function handleAddExpense(e) {
    e.preventDefault();
    document.getElementById('submit-record-btn').disabled = true;
    
    const date = expenseDateInput.value;
    
    const typeInput = document.querySelector('input[name="expenseType"]:checked');
    const type = typeInput ? typeInput.value : 'expense';
    
    const moodEmojiInput = document.querySelector('input[name="moodEmoji"]:checked');
    const moodEmoji = moodEmojiInput ? moodEmojiInput.value : '';
    const moodMessage = document.getElementById('mood-message').value.trim();
    
    let category = '其他';
    if (type === 'income') {
        const cat = document.querySelector('input[name="incomeCategory"]:checked');
        if (cat) category = cat.value;
    } else {
        const cat = document.querySelector('input[name="category"]:checked');
        if (cat) category = cat.value;
    }
    
    // 處理自訂類別
    if (category === '其他') {
        const customCat = document.getElementById('custom-category-input').value.trim();
        if (customCat) category = customCat;
    }
    
    const amountVal = document.getElementById('expense-amount').value;
    const amount = amountVal ? parseFloat(amountVal) : 0;
    
    const entryData = {
        uid: currentUser.uid,
        userEmail: currentUser.email, // 讓伴侶靠 email 撈取
        date,
        type,
        moodEmoji,
        moodMessage,
        category,
        amount
    };
    
    try {
        if (editingEntryId) {
            await setDoc(doc(db, 'entries', editingEntryId), entryData, { merge: true });
        } else {
            entryData.timestamp = Date.now();
            await addDoc(collection(db, 'entries'), entryData);
        }
        
        playSuccessSound(); // 儲存日記成功音效
        
        // 清空表單與重置編輯狀態
        document.getElementById('expense-amount').value = '';
        document.getElementById('mood-message').value = '';
        document.getElementById('custom-category-input').value = '';
        editingEntryId = null;
        document.getElementById('submit-record-btn').textContent = '儲存日記';
        
        // 儲存成功後，最直覺的反饋就是直接關閉視窗，讓使用者看到底下的月曆表情更新！
        closeModal();
    } catch(err) {
        alert("儲存失敗: " + err.message);
    } finally {
        document.getElementById('submit-record-btn').disabled = false;
    }
}

function openModal(defaultDateStr) {
    editingEntryId = null;
    document.getElementById('expense-amount').value = '';
    document.getElementById('mood-message').value = '';
    document.getElementById('custom-category-input').value = '';
    document.getElementById('submit-record-btn').textContent = '儲存日記';
    document.getElementById('custom-category-group').classList.add('hidden');
    
    expenseDateInput.value = defaultDateStr;
    renderDailyRecords(defaultDateStr);
    expenseModal.classList.remove('hidden');
    // 故意增加一筆歷史紀錄，用來攔截未來的「返回鍵」
    history.pushState({ modal: 'expense' }, '', '#expense');
}

function closeModal() {
    if (!expenseModal.classList.contains('hidden')) {
        expenseModal.classList.add('hidden');
        // 自動倒回一步歷史，避免下次按返回要按兩次
        if (location.hash === '#expense') {
            history.back();
        }
    }
}

// 掛載全域讓 onClick 可以呼叫
window.deleteEntry = async function(id, dateStr) {
    if(confirm('確定刪除此紀錄嗎？')) {
        await deleteDoc(doc(db, 'entries', id));
        // 強制馬上重新渲染 Modal 內的清單，就不會有卡住的錯覺了
        renderDailyRecords(dateStr);
    }
}

// 掛載全域編輯功能
window.editEntry = function(id) {
    const exp = myEntries.find(e => e.id === id);
    if(!exp) return;
    
    editingEntryId = exp.id;
    document.getElementById('expense-amount').value = exp.amount > 0 ? exp.amount : '';
    document.getElementById('mood-message').value = exp.moodMessage || '';
    
    if (exp.type) {
        const t = document.querySelector(`input[name="expenseType"][value="${exp.type}"]`);
        if(t) {
            t.checked = true;
            t.dispatchEvent(new Event('change'));
        }
    } else {
        const fallback = document.querySelector(`input[name="expenseType"][value="expense"]`);
        if(fallback) {
            fallback.checked = true;
            fallback.dispatchEvent(new Event('change'));
        }
    }

    if (exp.moodEmoji) {
        const r = document.querySelector(`input[name="moodEmoji"][value="${exp.moodEmoji}"]`);
        if(r) r.checked = true;
    }
    if (exp.category) {
        let matchedRadio = null;
        if (exp.type === 'income') {
            matchedRadio = document.querySelector(`input[name="incomeCategory"][value="${exp.category}"]`);
        } else {
            matchedRadio = document.querySelector(`input[name="category"][value="${exp.category}"]`);
        }
        
        if (matchedRadio) {
            matchedRadio.checked = true;
            document.getElementById('custom-category-input').value = '';
        } else {
            // 是自訂的類別
            if (exp.type === 'income') {
                const target = document.querySelector(`input[name="incomeCategory"][value="其他"]`);
                if(target) target.checked = true;
            } else {
                const target = document.querySelector(`input[name="category"][value="其他"]`);
                if(target) target.checked = true;
            }
            document.getElementById('custom-category-input').value = exp.category;
        }
    }
    
    // 主動觸發一次事件檢查以展開文字框
    const typeRadio = document.querySelector(`input[name="expenseType"]:checked`);
    if(typeRadio) typeRadio.dispatchEvent(new Event('change'));
    
    document.getElementById('submit-record-btn').textContent = '💾 更新此紀錄';
    
    // 滾動並讓輸入框反白，引導使用者修改
    const msgInput = document.getElementById('mood-message');
    msgInput.focus();
    msgInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderDailyRecords(dateStr) {
    // 每次渲染前必須先清空舊的 DOM，否則切換無紀錄的日期時，殘留的清單會造成混淆
    dailyRecordsList.innerHTML = '';
    
    // 渲染自己的紀錄 (包含金額與心情)
    const dailyMy = myEntries.filter(exp => exp.date === dateStr).sort((a,b) => b.timestamp - a.timestamp);
    
    if (dailyMy.length > 0) {
        dailyRecordsContainer.classList.remove('hidden');
        
        dailyMy.forEach(exp => {
            const expDate = new Date(exp.timestamp);
            const timeStr = `${String(expDate.getHours()).padStart(2, '0')}:${String(expDate.getMinutes()).padStart(2, '0')}`;
            
            const li = document.createElement('li');
            li.className = 'record-item';
            li.innerHTML = `
                <div class="record-info">
                    <div style="font-size:1.6rem; min-width: 40px;">${exp.moodEmoji || ''}</div>
                    <div class="record-meta">
                        <div style="margin-bottom:2px;"><span style="font-size:0.85rem; color:var(--text-secondary); margin-right:6px; font-weight:500;">${timeStr}</span>
                        ${exp.amount > 0 ? `<span class="record-cat" style="color:${categoryColors[exp.category] || '#999'}; font-size:1.15rem; font-weight:600;">${exp.category}</span>` : '<span class="record-cat" style="font-size:1.15rem; font-weight:600;">心情</span>'}</div>
                        ${exp.moodMessage ? `<div class="record-note" style="color:var(--primary-color); font-size:1.2rem; margin-top:2px; font-weight:500;">「${exp.moodMessage}」</div>` : ''}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem; justify-content:flex-end;">
                    ${exp.amount > 0 ? `<span class="record-amount" style="font-size:1.2rem; margin-right:4px; ${exp.type === 'income' ? 'color:#2ecc71;' : ''}">${exp.type === 'income' ? '+' : '-'}$${exp.amount.toLocaleString()}</span>` : ''}
                    <button class="record-actions" style="background:#5c7cfa; color:white; border:none; padding:4px 8px; border-radius:var(--radius-sm); cursor:pointer; font-size:0.8rem;" onclick="editEntry('${exp.id}')">編輯</button>
                    <button class="record-actions delete-btn" onclick="deleteEntry('${exp.id}', '${dateStr}')">刪除</button>
                </div>
            `;
            
            dailyRecordsList.appendChild(li);
        });
    } else {
        dailyRecordsContainer.classList.add('hidden');
    }

    // 渲染另一半的紀錄 (包含金額與心情)
    partnerDailyMoodContainer.innerHTML = '';
    const dailyPartner = partnerEntries.filter(exp => exp.date === dateStr && !exp.isMegaphone).sort((a,b) => b.timestamp - a.timestamp);
    if(dailyPartner.length > 0) {
        let html = `<strong style="font-size:1.1rem; color:var(--text-primary)">另一半的紀錄：</strong><ul class="records-list" style="margin-top:0.5rem">`;
        dailyPartner.forEach(exp => {
            const expDate = new Date(exp.timestamp);
            const timeStr = `${String(expDate.getHours()).padStart(2, '0')}:${String(expDate.getMinutes()).padStart(2, '0')}`;
            
            html += `
                <li class="record-item" style="background: rgba(255,192,203,0.15); border-color: rgba(255,192,203,0.5);">
                    <div class="record-info">
                        <div style="font-size:1.6rem; min-width: 40px;">${exp.moodEmoji || ''}</div>
                        <div class="record-meta">
                            <div style="margin-bottom:2px;"><span style="font-size:0.85rem; color:var(--text-secondary); margin-right:6px; font-weight:500;">${timeStr}</span>
                            ${exp.amount > 0 ? `<span class="record-cat" style="color:${categoryColors[exp.category] || '#999'}; font-size:1.15rem; font-weight:600;">${exp.category}</span>` : '<span class="record-cat" style="font-size:1.15rem; font-weight:600;">心情</span>'}</div>
                            ${exp.moodMessage ? `<div class="record-note" style="color:var(--text-secondary); font-size:1.2rem; margin-top:2px; font-weight:500;">「${exp.moodMessage}」</div>` : ''}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.5rem; justify-content:flex-end;">
                        ${exp.amount > 0 ? `<span class="record-amount" style="font-size:1.2rem; margin-right:4px; ${exp.type === 'income' ? 'color:#2ecc71;' : ''}">${exp.type === 'income' ? '+' : '-'}$${exp.amount.toLocaleString()}</span>` : ''}
                    </div>
                </li>
            `;
        });
        html += `</ul>`;
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

// ==================== 你畫我猜小遊戲 ====================
let gameUnsubscribe = null;
let currentGameData = null;
let drawCtx = null;
let isDrawing = false;
let currentLineColor = '#000000';
let gameTimerInterval = null;

function initGameSystem() {
    drawCtx = dCanvas.getContext('2d');
    
    // 初始化畫布設定 (採用白色背景，避免輸出 JPG 變黑)
    function clearCanvas() {
        drawCtx.fillStyle = '#ffffff';
        drawCtx.fillRect(0, 0, dCanvas.width, dCanvas.height);
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.lineWidth = 4;
        drawCtx.strokeStyle = currentLineColor;
    }
    clearCanvas();
    
    // 轉換座標的 helper (適應任何 CSS width)
    function getPos(e) {
        const rect = dCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (dCanvas.width / rect.width),
            y: (clientY - rect.top) * (dCanvas.height / rect.height)
        };
    }

    function startDraw(e) {
        if (drawerTools.classList.contains('hidden')) return;
        e.preventDefault();
        isDrawing = true;
        const pos = getPos(e);
        drawCtx.beginPath();
        drawCtx.moveTo(pos.x, pos.y);
    }

    function drawing(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        drawCtx.lineTo(pos.x, pos.y);
        drawCtx.stroke();
    }

    function stopDraw(e) {
        if (isDrawing) {
            e.preventDefault();
            isDrawing = false;
            drawCtx.beginPath();
        }
    }

    // 事件綁定 (滑鼠)
    dCanvas.addEventListener('mousedown', startDraw);
    dCanvas.addEventListener('mousemove', drawing);
    dCanvas.addEventListener('mouseup', stopDraw);
    dCanvas.addEventListener('mouseout', stopDraw);
    // 事件綁定 (觸控)
    dCanvas.addEventListener('touchstart', startDraw, {passive: false});
    dCanvas.addEventListener('touchmove', drawing, {passive: false});
    dCanvas.addEventListener('touchend', stopDraw, {passive: false});
    dCanvas.addEventListener('touchcancel', stopDraw, {passive: false});

    // 工具列綁定
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.color-btn').forEach(b => {
                b.style.borderColor = b.dataset.color === '#000000' ? '#000' : 'transparent';
                if (b === e.target && b.dataset.color !== '#000000') b.style.borderColor = '#000';
            });
            if (e.target.dataset.color === '#000000') e.target.style.borderColor = '#fff'; // 反差標示
            currentLineColor = e.target.dataset.color;
            drawCtx.strokeStyle = currentLineColor;
            playSound(300, 'sine', 0.05, 100);
        });
    });

    document.getElementById('clear-canvas-btn').addEventListener('click', () => {
        clearCanvas();
        playSound(200, 'sawtooth', 0.1, 100);
    });
}

// 產生雙方共用的遊戲房間 ID
function getGameDocId() {
    return [currentUser.email.replace(/[@.]/g, '_'), profileData.partnerEmail.replace(/[@.]/g, '_')].sort().join('-');
}

// 綁定主畫面的開啟與關閉按鈕
gameBtn.addEventListener('click', () => {
    if (!profileData || !profileData.partnerEmail) {
        alert('請先透過右上角設定綁定另一半的 Email 才能開啟你畫我猜喔！');
        return;
    }
    gameModal.classList.remove('hidden');
    // 若為自己的畫圖回合，重新刷一次 Canvas 避免寬度跑掉
    if (currentGameData && currentGameData.status === 'waiting_for_drawing' && currentGameData.turnUid === currentUser.email) {
        const rect = dCanvas.parentElement.getBoundingClientRect();
        if(rect.width > 0) {
            dCanvas.width = rect.width;
            dCanvas.height = 300;
            drawCtx.fillStyle = '#ffffff';
            drawCtx.fillRect(0, 0, dCanvas.width, dCanvas.height);
            drawCtx.lineWidth = 4;
            drawCtx.strokeStyle = currentLineColor;
        }
    }
});

closeGameBtn.addEventListener('click', () => {
    gameModal.classList.add('hidden');
});

// 資料庫同步與倒數計時
function setupGameSync() {
    if (!profileData || !profileData.partnerEmail) return;
    
    if (gameUnsubscribe) gameUnsubscribe();
    
    const gameDocRef = doc(db, 'games', getGameDocId());
    
    gameUnsubscribe = onSnapshot(gameDocRef, (snap) => {
        if (!snap.exists()) {
            currentGameData = {
                status: 'waiting_for_drawing',
                turnUid: currentUser.email,
                drawerUid: currentUser.email,
                drawingImage: '',
                answer: '',
                deadline: Date.now() + 12 * 60 * 60 * 1000,
                lastResult: '這是你們的第一局！'
            };
            setDoc(gameDocRef, currentGameData).catch(err => {
                console.error("建立遊戲房失敗:", err);
            });
            updateGameUI();
        } else {
            currentGameData = snap.data();
            checkGameTimeout(gameDocRef);
            updateGameUI();
        }
    });
    
    if (gameTimerInterval) clearInterval(gameTimerInterval);
    gameTimerInterval = setInterval(() => {
        if(currentGameData) {
            checkGameTimeout(gameDocRef);
            updateTimerDisplay();
        }
    }, 1000);
}

// 檢查是否逾期
async function checkGameTimeout(docRef) {
    if (!currentGameData || !profileData.partnerEmail) return;
    const now = Date.now();
    // 只有輪到這台設備的人負責戳破超時 (避免兩隻手機同時送出覆蓋)
    if (currentGameData.turnUid === currentUser.email && now > currentGameData.deadline) {
        let nextTurnUid = profileData.partnerEmail; // 強制換對方的回合畫畫
        
        currentGameData.status = 'waiting_for_drawing';
        currentGameData.turnUid = nextTurnUid;
        currentGameData.drawerUid = nextTurnUid;
        currentGameData.drawingImage = '';
        currentGameData.answer = '';
        currentGameData.deadline = Date.now() + 12 * 60 * 60 * 1000;
        currentGameData.lastResult = '上一局太久沒動作 (逾時 12 小時)，已自動換人！';
        
        await setDoc(docRef, currentGameData);
    }
}

// 更新畫面的小紅點與 Modal 狀態
function updateGameUI() {
    if (!currentGameData) return;
    
    const isMyTurn = currentGameData.turnUid === currentUser.email;
    
    if (isMyTurn && gameModal.classList.contains('hidden')) {
        gameBtn.innerHTML = '🎨 畫猜 <span style="background:red;width:8px;height:8px;border-radius:50%;display:inline-block;margin-left:4px;"></span>';
    } else {
        gameBtn.innerHTML = '🎨 畫猜';
    }
    
    gameLastResult.textContent = currentGameData.lastResult || '';
    
    if (currentGameData.status === 'waiting_for_drawing') {
        if (isMyTurn) {
            gameStatusText.textContent = '🎨 您的回合！請作畫出題';
            dCanvas.style.display = 'block';
            guessImage.style.display = 'none';
            drawerTools.classList.remove('hidden');
            drawerInputZone.classList.remove('hidden');
            guesserInputZone.classList.add('hidden');
        } else {
            gameStatusText.textContent = '⏳ 等待對方作畫中...';
            dCanvas.style.display = 'none';
            guessImage.style.display = 'block';
            guessImage.src = ''; 
            drawerTools.classList.add('hidden');
            drawerInputZone.classList.add('hidden');
            guesserInputZone.classList.add('hidden');
        }
    } else if (currentGameData.status === 'waiting_for_guess') {
        dCanvas.style.display = 'none';
        guessImage.style.display = 'block';
        guessImage.src = currentGameData.drawingImage || '';
        
        drawerTools.classList.add('hidden');
        drawerInputZone.classList.add('hidden');
        
        if (isMyTurn) {
            gameStatusText.textContent = '🤔 您的回合！換您猜猜看這畫了什麼';
            guesserInputZone.classList.remove('hidden');
        } else {
            gameStatusText.textContent = '⏳ 對方正在努力猜測您的畫作...';
            guesserInputZone.classList.add('hidden');
        }
    }
}

function updateTimerDisplay() {
    if (!gameModal || gameModal.classList.contains('hidden') || !currentGameData) return;
    
    const now = Date.now();
    const diff = currentGameData.deadline - now;
    if (diff <= 0) {
        gameTimerDisplay.textContent = '⏳ 結算中...';
        return;
    }
    
    const hrs = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    gameTimerDisplay.textContent = `倒數 ${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

// 送出畫作給對方猜
submitDrawingBtn.addEventListener('click', async () => {
    const answer = gameAnswerInput.value.trim();
    if (!answer) return alert('必須設定圖畫的解答喔！');
    if (!profileData.partnerEmail) return alert('必須先綁定另一半才能玩！');
    
    submitDrawingBtn.disabled = true;
    submitDrawingBtn.textContent = '上傳畫作中...';
    
    try {
        const dataUrl = dCanvas.toDataURL('image/jpeg', 0.8);
        const nextTurnUid = profileData.partnerEmail; // 換對方猜
        
        // 確保儲存路徑符合設定
        await setDoc(doc(db, 'games', getGameDocId()), {
            status: 'waiting_for_guess',
            turnUid: nextTurnUid,
            drawerUid: currentUser.email,
            drawingImage: dataUrl,
            answer: answer,
            deadline: Date.now() + 12 * 60 * 60 * 1000,
            lastResult: '畫作已送出，等待對方答題！'
        });
        
        gameAnswerInput.value = '';
        closeGameBtn.click();
        playSound(300, 'sine', 0.1, 400); playSound(500, 'sine', 0.2, 600);
    } catch(err) {
        console.error(err);
        alert('上傳發生錯誤，請重試。');
    }
    submitDrawingBtn.disabled = false;
    submitDrawingBtn.textContent = '發送給伴侶猜';
});

// 送出解答
submitGuessBtn.addEventListener('click', async () => {
    const guess = gameGuessInput.value.trim();
    if (!guess) return alert('請輸入您的猜測！');
    
    submitGuessBtn.disabled = true;
    
    try {
        // 寬鬆比對：轉小寫、去除內部所有空白
        const correctAns = (currentGameData.answer || '').toLowerCase().replace(/\s+/g,'');
        const userGuess = guess.toLowerCase().replace(/\s+/g,'');
        
        let isCorrect = userGuess.includes(correctAns) || correctAns.includes(userGuess);
        
        // 依照規則，猜完後輪回猜的人畫畫 (回合強制轉移)
        const nextTurnUid = currentUser.email; 
        
        let newResult = isCorrect ? '🎉 上一局猜對了！上一幅畫是「' + currentGameData.answer + '」' : '❌ 上一局猜錯囉！上一幅畫其實是「' + currentGameData.answer + '」';
        
        await setDoc(doc(db, 'games', getGameDocId()), {
            status: 'waiting_for_drawing',
            turnUid: nextTurnUid,
            drawerUid: nextTurnUid,
            drawingImage: '',
            answer: '',
            deadline: Date.now() + 12 * 60 * 60 * 1000,
            lastResult: newResult
        });
        
        gameGuessInput.value = '';
        if(isCorrect) {
            playSound(200, 'sine', 0.1, 400); playSound(400, 'sine', 0.2, 600);
            alert('答對了！這局結束，現在輪到您畫圖出題囉！');  
        } else {
            playSound(400, 'square', 0.2, 200);
            alert('哎呀猜錯了！正確答案是：' + currentGameData.answer + '\n沒關係，現在輪到您出題報仇了！');
        }
        closeGameBtn.click();
    } catch(err) {
        console.error(err);
        alert('驗證發生錯誤，請重試。');
    }
    submitGuessBtn.disabled = false;
});

