import { LiaBookOpenSolid, LiaChessKnightSolid, LiaChessKingSolid } from "react-icons/lia";

export default function RulesPanel() {
  return (
    <section id="rules" className="tab-content active">
      <div className="rules">
        <h2><LiaBookOpenSolid aria-hidden="true" /> Правила шахмат</h2>
        <p>Шахматы — стратегическая настольная игра для двух игроков. Цель — поставить мат королю противника.</p>
        <h3><LiaChessKnightSolid aria-hidden="true" /> Фигуры и их ходы:</h3>
        <ul>
          <li><strong>Король:</strong> ходит на одну клетку в любом направлении.</li>
          <li><strong>Ферзь:</strong> ходит по горизонтали, вертикали и диагонали.</li>
          <li><strong>Ладья:</strong> ходит по горизонтали и вертикали.</li>
          <li><strong>Слон:</strong> ходит по диагонали.</li>
          <li><strong>Конь:</strong> ходит буквой «Г».</li>
          <li><strong>Пешка:</strong> ходит вперёд, бьёт по диагонали и может превращаться.</li>
        </ul>
        <h3><LiaChessKingSolid aria-hidden="true" /> Особые ходы:</h3>
        <ul>
          <li>Рокировка.</li>
          <li>Взятие на проходе.</li>
          <li>Превращение пешки.</li>
        </ul>
        <h3>Результаты:</h3>
        <ul>
          <li><strong>Шах:</strong> король находится под атакой.</li>
          <li><strong>Мат:</strong> нет защиты от шаха.</li>
          <li><strong>Пат:</strong> ходов нет, король не под шахом — ничья.</li>
        </ul>
      </div>
    </section>
  );
}
