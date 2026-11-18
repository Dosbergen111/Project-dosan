import { LiaInfoSolid, LiaChessBoardSolid } from "react-icons/lia";

export default function AboutPanel() {
  return (
    <section id="about" className="tab-content active">
      <div className="about">
        <h2><LiaInfoSolid aria-hidden="true" /> О программе</h2>
        <p>Добро пожаловать в <strong>Chess Master</strong> — шахматный сайт для игры и развития рейтинга.</p>
        <h3><LiaChessBoardSolid aria-hidden="true" /> Возможности:</h3>
        <ul>
          <li>Легальные ходы, шах, мат, пат и рокировка.</li>
          <li>Игра против компьютера с несколькими уровнями сложности.</li>
          <li>История ходов, отмена хода и таблица лидеров.</li>
          <li>Регистрация, профиль и сохранение Elo.</li>
        </ul>
      </div>
    </section>
  );
}
