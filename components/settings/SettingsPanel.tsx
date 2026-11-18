"use client";

import ChangePasswordForm from "@/components/ChangePasswordForm";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/chess/GameProvider";

export default function SettingsPanel() {
  const { account } = useAuth();
  const game = useGame();
  return (
    <section className="tab-content active">
      <div className="settings-panel">
        <h2>⚙️ Настройки</h2>
        <div className="settings-group"><label><input type="checkbox" defaultChecked /> 🔊 Звуки ходов</label></div>
        <div className="settings-group"><label><input type="checkbox" defaultChecked /> ✨ Анимация ходов</label></div>
        <div className="settings-group"><label><input type="checkbox" checked={game.coordinatesShown} onChange={(event) => game.setCoordinatesShown(event.target.checked)} /> 📍 Показать координаты</label></div>
        <div className="settings-group"><label><input type="checkbox" checked={game.materialShown} onChange={(event) => game.setMaterialShown(event.target.checked)} /> ⚖️ Оценка материала</label></div>
        <div className="settings-group">
          <label htmlFor="board-style">Стиль доски:</label>
          <select id="board-style" value={game.boardStyle} onChange={(event) => game.setBoardStyle(event.target.value)}>
            <option value="default">Классический</option><option value="blue">Синий</option><option value="green">Зелёный</option><option value="wood">Дерево</option>
          </select>
        </div>
        <div className="settings-group">
          <label htmlFor="board-size">Размер доски:</label>
          <select id="board-size" value={game.boardSize} onChange={(event) => game.setBoardSize(event.target.value as typeof game.boardSize)}>
            <option value="small">Маленькая</option><option value="medium">Средняя</option><option value="large">Большая</option>
          </select>
        </div>
        <div className="settings-group">
          <label>Тёмная тема:</label>
          <label className="switch"><input type="checkbox" checked={game.lightTheme} onChange={(event) => game.setLightTheme(event.target.checked)} /><span className="slider round" /></label>
        </div>
        <div className="settings-group"><label><strong>♛ Ваш рейтинг Elo:</strong></label><div className="elo-display"><div className="elo-rating-big">{account?.elo ?? "—"}</div><div className="elo-category">{account?.league ?? "Войдите, чтобы увидеть рейтинг"}</div></div></div>
        {account && <div className="settings-group"><h3>Смена пароля</h3><ChangePasswordForm /></div>}
      </div>
    </section>
  );
}
