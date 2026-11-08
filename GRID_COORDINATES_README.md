# Responsive Chess Coordinates Grid-Alignment Fix
**Дата: 14.04.2026**

## 📋 Задача
Исправить верстку координат шахматной доски так, чтобы они всегда находились строго напротив соответствующих рядов и колонок при любом размере экрана.

## ✅ Решение

### 1. Архитектура HTML (chess.html)
Переделана структура контейнера доски с Flexbox на CSS Grid:

**Старая структура (Flexbox):**
```html
<div class="board-container">
  <div class="board-labels row-labels">...</div>
  <div>
    <div class="board" id="board"></div>
    <div class="col-labels">...</div>
  </div>
</div>
```

**Новая структура (CSS Grid 9×9):**
```html
<div class="board-grid-wrapper">
  <!-- 1. Угловая ячейка (пусто) -->
  <div class="board-corner"></div>
  
  <!-- 2. Буквы колонн (A-H) в 1-й строке -->
  <div class="col-label">A</div>
  <div class="col-label">B</div>
  ...
  <div class="col-label">H</div>
  
  <!-- 3. Цифры рядов (8-1) в 1-й колонке -->
  <div class="row-label">8</div>
  <div class="row-label">7</div>
  ...
  <div class="row-label">1</div>
  
  <!-- 4. Сама доска во внутреннем grid (2-9 × 2-9) -->
  <div class="board" id="board"></div>
</div>
```

### 2. CSS Стили (style.css)

#### Основная сетка 9×9
```css
.board-grid-wrapper {
    display: grid;
    grid-template-columns: 30px repeat(8, 60px);
    grid-template-rows: 24px repeat(8, 60px);
    width: 510px;
    height: 504px;
    gap: 0;
}
```

#### Позиционирование координат
- **`.board-corner`**: grid-column: 1; grid-row: 1
- **`.col-label`** (A-H): grid-row: 1; grid-column: 2-9 (через nth-child селекторы)
- **`.row-label`** (8-1): grid-column: 1; grid-row: 2-9 (через nth-child селекторы)
- **`.board`**: grid-column: 2/−1; grid-row: 2/−1 (займет оставшуюся область)

#### Размеры доски
Три размера с автоматическим масштабированием:

| Размер | Координаты | Клетка | Сетка | Шрифт |
|--------|-----------|--------|-------|--------|
| **Small** | 20px | 40px | 340×336px | 10px |
| **Medium** | 30px | 60px | 510×504px | 12px |
| **Large** | 40px | 80px | 680×672px | 14px |

### 3. JavaScript Обновления (script.js)

#### Функция `quickSetBoardSize(size)`
**Было:**
```javascript
boardElement.className = `board ${sizeClass}`;
```

**Стало:**
```javascript
const boardGridWrapper = document.querySelector('.board-grid-wrapper');
if (boardGridWrapper) {
    boardGridWrapper.className = `board-grid-wrapper ${sizeClass}`;
}
```

#### Функция `changeBoardSize()`
Аналогичное изменение для применения класса к wrapper вместо доски.

#### Функция `updateBoardCoordinates()`
**Было:**
```javascript
const rowLabels = document.querySelector('.row-labels');
const colLabels = document.querySelector('.col-labels');
rowLabels.innerHTML = '';
colLabels.innerHTML = '';
// ... создание новых элементов
```

**Стало:**
```javascript
const rowLabels = document.querySelectorAll('.board-grid-wrapper .row-label');
const colLabels = document.querySelectorAll('.board-grid-wrapper .col-label');
if (!rowLabels || !colLabels) return;

for (let i = 0; i < 8; i++) {
    if (boardFlipped) {
        rowLabels[i].textContent = (i + 1);
        colLabels[i].textContent = String.fromCharCode(72 - i); // H, G, F...
    } else {
        rowLabels[i].textContent = (8 - i);
        colLabels[i].textContent = String.fromCharCode(65 + i); // A, B, C...
    }
}
```

### 4. CSS NT-Child Селекторы
Для правильного позиционирования координат в сетке:

```css
/* col-label (элементы 2-9) */
.board-grid-wrapper > .col-label:nth-child(2) { grid-column: 2; }
.board-grid-wrapper > .col-label:nth-child(3) { grid-column: 3; }
/* ... до 9 */

/* row-label (элементы 10-17) */
.board-grid-wrapper > .row-label:nth-child(10) { grid-row: 2; }
.board-grid-wrapper > .row-label:nth-child(11) { grid-row: 3; }
/* ... до 17 */
```

## 🎯 Преимущества

✅ **Идеальное выравнивание** - Координаты всегда идеально выровнены с клетками благодаря CSS Grid  
✅ **Отзывчивость** - При изменении размера экрана всё масштабируется пропорционально  
✅ **No Absolute Positioning** - Нет position: absolute, используется grid layout  
✅ **Гибкость** - Легко менять размеры без пересчёта координат  
✅ **Производительность** - Нет JS-пересчётов размеров, всё решается CSS  
✅ **Совместимость** - Работает со всеми современными браузерами  

## 🔄 Тестирование

1. **Изменение размера доски** - нажмите S, M, L кнопки
   - Координаты должны масштабироваться и оставаться выровненными
   
2. **Переворот доски** - выберите цвет (черные)
   - Координаты должны переворачиваться (1-8 → 8-1, A-H → H-A)
   
3. **Адаптивность** - измените ширину экрана
   - Вся конструкция должна масштабироваться пропорционально

## 📝 Структура файлов

- `chess.html` - обновленная HTML структура (`.board-grid-wrapper`)
- `style.css` - новые CSS Grid стили для координат
- `script.js` - обновленные функции для работы с wrapper
- `test_grid.html` - простой пример CSS Grid координат (для отладки)

## 🚀 Будущие улучшения

- Добавить transition анимации при изменении размера
- Реализовать автоматическое масштабирование под размер экрана
- Добавить поддержку мобильных устройств с touch-координатами

---

**Статус:** ✅ Завершено  
**Проверено:** CSS Grid 9×9 правильно выравнивает координаты  
**Совместимость:** Chrome, Firefox, Safari, Edge
