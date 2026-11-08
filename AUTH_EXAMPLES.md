# 💡 ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ И ИНТЕГРАЦИИ

## 📌 Пример 1: Проверка авторизации и прав доступа

```javascript
// В любом месте вашего кода вы можете проверить текущего пользователя

function checkUserPermissions() {
    const userData = localStorage.getItem('userData');
    
    if (!userData) {
        console.log("❌ Пользователь не авторизован");
        return false;
    }
    
    try {
        const user = JSON.parse(userData);
        
        // Проверка роли
        if (user.role === 'admin') {
            console.log("✅ Администратор. Доступ гарантирован.");
        }
        
        // Проверка VIP-статуса
        if (user.is_premium) {
            console.log("💎 Premium-пользователь. Функции разблокированы.");
        }
        
        // Проверка энергии
        if (user.is_blocked) {
            console.log("🔴 Пользователь забанен");
            return false;
        }
        
        return true;
    } catch (error) {
        console.error("Ошибка парса userData", error);
        return false;
    }
}
```

---

## 📌 Пример 2: Вызов updateUI() вручную (если нужно)

```javascript
// Если вы изменили данные пользователя в localStorage
function updateUserDataAndRefresh() {
    const userData = localStorage.getItem('userData');
    const user = JSON.parse(userData);
    
    // Изменяем данные
    user.elo = 2000;
    user.is_premium = true;
    
    // Сохраняем обратно
    localStorage.setItem('userData', JSON.stringify(user));
    
    // Обновляем UI
    updateUI(); // <- Это обновит всё: админку, VIP-бейдж, профиль
}
```

---

## 📌 Пример 3: Создание кастомного уведомления

```javascript
// Система уведомлений полностью готова к использованию

// Успех
showNotification("✅ Операция выполнена успешно!", 'success');

// Ошибка
showNotification("❌ Что-то пошло не так", 'error');

// Информация
showNotification("ℹ️ Это информационное сообщение", 'info');

// Предупреждение
showNotification("⚠️ Внимание! Проверьте данные", 'warning');

// С кастомными emoji
showNotification("🎉 Вы получили 100 очков!", 'success');
```

---

## 📌 Пример 4: Проверка VIP-статуса перед действием

```javascript
function startPremiumFeature() {
    const userData = localStorage.getItem('userData');
    
    if (!userData) {
        showNotification("❌ Требуется авторизация", 'error');
        openAuthModal();
        return;
    }
    
    const user = JSON.parse(userData);
    
    if (!user.is_premium) {
        showNotification("💎 Эта функция доступна только для Premium", 'warning');
        return;
    }
    
    // Выполняем премиум-функцию
    console.log("✅ Запуск Premium-функции...");
    // ... ваш код ...
}
```

---

## 📌 Пример 5: Обработка полного цикла авторизации

```javascript
// Этот код уже встроен в приложение, но вот полный цикл:

async function completeAuthFlow(username, password, isRegister) {
    try {
        // 1. Отправляем запрос
        const endpoint = isRegister ? '/register' : '/login';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error);
        }
        
        // 2. Сохраняем в localStorage
        localStorage.setItem('userData', JSON.stringify(data));
        
        // 3. Обновляем UI (это вызывает updateUI → checkPremiumSettings)
        checkAuth(); // или updateUI()
        
        // 4. Закрываем модаль
        closeAuthModal();
        
        // 5. Показываем уведомление
        showNotification(
            `✅ Добро пожаловать, ${data.username}!${
                data.role === 'admin' ? ' 👑 [Admin]' : ''
            }${
                data.is_premium ? ' 💎 [Premium]' : ''
            }`,
            'success'
        );
        
        return true;
    } catch (error) {
        showNotification(`❌ ${error.message}`, 'error');
        return false;
    }
}
```

---

## 📌 Пример 6: Мониторинг изменений статуса

```javascript
// Если вам нужно отслеживать изменения пользователя в реальном времени

function watchUserChanges() {
    let lastUserData = localStorage.getItem('userData');
    
    // Проверяем каждые 5 секунд (или используйте другой интервал)
    setInterval(() => {
        const currentUserData = localStorage.getItem('userData');
        
        if (currentUserData !== lastUserData) {
            console.log("⚡ Данные пользователя изменились!");
            
            const oldUser = JSON.parse(lastUserData || '{}');
            const newUser = JSON.parse(currentUserData || '{}');
            
            // Проверяем, что изменилось
            if (oldUser.is_premium !== newUser.is_premium) {
                console.log("VIP-статус изменился:", newUser.is_premium);
                showNotification(
                    newUser.is_premium ? 
                    "🎉 Вы получили Premium!" : 
                    "ℹ️ Premium был отменен",
                    'info'
                );
            }
            
            if (oldUser.elo !== newUser.elo) {
                console.log("Рейтинг изменился:", newUser.elo);
            }
            
            lastUserData = currentUserData;
        }
    }, 5000);
}
```

---

## 📌 Пример 7: Условные элементы UI на основе роли

```javascript
// HTML:
// <button id="admin-only-btn" style="display: none;">⚙️ Админ Функция</button>

// JavaScript:
function showAdminElements() {
    const userData = localStorage.getItem('userData');
    if (!userData) return;
    
    const user = JSON.parse(userData);
    const adminBtn = document.getElementById('admin-only-btn');
    
    if (user.role === 'admin' && adminBtn) {
        adminBtn.style.display = 'block';
    } else if (adminBtn) {
        adminBtn.style.display = 'none';
    }
}

// Вызовите при загрузке
document.addEventListener('DOMContentLoaded', showAdminElements);
```

---

## 📌 Пример 8: Экспорт и импорт профиля

```javascript
function exportUserProfile() {
    const userData = localStorage.getItem('userData');
    if (!userData) {
        showNotification("❌ Нет данных для экспорта", 'error');
        return;
    }
    
    const user = JSON.parse(userData);
    const dataStr = JSON.stringify(user, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `profile_${user.username}_${Date.now()}.json`;
    link.click();
    
    showNotification("✅ Профиль экспортирован", 'success');
}

function importUserProfile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const userData = JSON.parse(e.target.result);
            localStorage.setItem('userData', JSON.stringify(userData));
            updateUI();
            showNotification("✅ Профиль импортирован", 'success');
        } catch (error) {
            showNotification("❌ Ошибка импорта профиля", 'error');
        }
    };
    reader.readAsText(file);
}
```

---

## 📌 Пример 9: Логирование действий для отладки

```javascript
// Добавьте это в конец script.js для полного логирования

function enableDebugMode() {
    console.log("🔍 DEBUG MODE: ВКЛЮЧЕН");
    
    // Перехватываем localStorage.setItem
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        if (key === 'userData') {
            console.log("[localStorage.setItem] userData обновлена:", JSON.parse(value));
        }
        originalSetItem.apply(this, arguments);
    };
    
    // Перехватываем showNotification
    const originalShowNotification = window.showNotification;
    window.showNotification = function(msg, type) {
        console.log(`[showNotification] ${type.toUpperCase()}: ${msg}`);
        originalShowNotification.apply(this, arguments);
    };
    
    console.log("✅ DEBUG MODE: Все события логируются в консоль");
}

// Включите debug режим: enableDebugMode();
```

---

## 📌 Пример 10: Автоматическое обновление профиля с сервера

```javascript
async function syncUserDataWithServer(userId) {
    try {
        // Запрашиваем актуальные данные с сервера
        const response = await fetch(`/api/user/${userId}`);
        const serverData = await response.json();
        
        if (response.ok) {
            // Сохраняем свежие данные
            localStorage.setItem('userData', JSON.stringify(serverData));
            updateUI();
            
            console.log("✅ Профиль синхронизирован с сервером");
            return true;
        } else {
            throw new Error(serverData.error);
        }
    } catch (error) {
        console.error("❌ Ошибка синхронизации:", error);
        return false;
    }
}

// Вызовите при загрузке приложения
// const userData = JSON.parse(localStorage.getItem('userData'));
// if (userData) syncUserDataWithServer(userData.id);
```

---

## 🎯 BEST PRACTICES

✅ **DO:**
- Всегда проверяйте наличие `userData` перед использованием
- Вызывайте `updateUI()` после изменения данных в localStorage
- Используйте `showNotification()` для обратной связи с пользователем
- Логируйте критические шаги для отладки

❌ **DON'T:**
- Не изменяйте напрямую DOM элементы, если можно использовать `updateUI()`
- Не вызывайте `initStockfish()` несколько раз
- Не сохраняйте чувствительные данные (пароли) в localStorage
- Не игнорируйте ошибки при парсе JSON

---

**Версия**: 1.0  
**Дата**: 21 апреля 2026 г.
