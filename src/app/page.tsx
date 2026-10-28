"use client";

import { useState } from "react";
import Heatmap from "../components/Heatmap";
import type { Category, Habit } from "../types/habit";

const categories: Category[] = ["Денсаулық", "Оқу", "Спорт", "Басқа"];

const initialHabits: Habit[] = [
  { id: 1, name: "Су ішу", category: "Денсаулық", streak: 5, doneToday: true },
  { id: 2, name: "Кітап оқу", category: "Оқу", streak: 12, doneToday: true },
  { id: 3, name: "Таңертеңгі жаттығу", category: "Спорт", streak: 3, doneToday: false },
  { id: 4, name: "Ағылшын тілі", category: "Оқу", streak: 7, doneToday: false },
];

// Жалған деректер: соңғы 28 күн (кейін дерекқордан келеді)
const heatmapData = Array.from({ length: 28 }, (_, i) => (i * 7 + 3) % 4);

const badge: Record<Category, string> = {
  Денсаулық: "bg-blue-100 text-blue-700",
  Оқу: "bg-purple-100 text-purple-700",
  Спорт: "bg-orange-100 text-orange-700",
  Басқа: "bg-gray-100 text-gray-700",
};

export default function Home() {
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [filter, setFilter] = useState<Category | "Барлығы">("Барлығы");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("Денсаулық");

  const visible =
    filter === "Барлығы" ? habits : habits.filter((h) => h.category === filter);

  const doneCount = habits.filter((h) => h.doneToday).length;
  const percent = habits.length ? Math.round((doneCount / habits.length) * 100) : 0;
  const bestStreak = habits.reduce((max, h) => Math.max(max, h.streak), 0);

  function toggleHabit(id: number) {
    setHabits((prev) =>
      prev.map((h) =>
        h.id === id
          ? {
              ...h,
              doneToday: !h.doneToday,
              streak: h.doneToday ? Math.max(0, h.streak - 1) : h.streak + 1,
            }
          : h
      )
    );
  }

  function addHabit() {
    if (!name.trim()) return;
    setHabits((prev) => [
      ...prev,
      { id: Date.now(), name: name.trim(), category, streak: 0, doneToday: false },
    ]);
    setName("");
  }

  function removeHabit(id: number) {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-indigo-600 text-white shadow">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">🌱 Habit Tracker</h1>
          <nav className="flex gap-5 text-sm">
            <a href="#" className="font-semibold underline underline-offset-4">Басты бет</a>
            <a href="#" className="opacity-80 hover:opacity-100">Әдеттер</a>
            <a href="#" className="opacity-80 hover:opacity-100">Статистика</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {/* Статистика карточкалары */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Бүгін орындалды</p>
            <p className="mt-1 text-3xl font-bold text-indigo-600">
              {doneCount}/{habits.length}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Ең ұзақ streak</p>
            <p className="mt-1 text-3xl font-bold text-orange-500">🔥 {bestStreak} күн</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Бүгінгі прогресс</p>
            <p className="mt-1 text-3xl font-bold text-green-600">{percent}%</p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Әдеттер тізімі */}
          <section className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold">Бүгінгі әдеттер</h2>

            {/* Сүзгі */}
            <div className="mb-4 flex flex-wrap gap-2">
              {(["Барлығы", ...categories] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    filter === c
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Тізім */}
            <ul className="divide-y">
              {visible.map((habit) => (
                <li key={habit.id} className="flex items-center justify-between gap-3 py-3">
                  <button
                    onClick={() => toggleHabit(habit.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm transition ${
                        habit.doneToday
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-gray-300 text-transparent hover:border-green-400"
                      }`}
                    >
                      ✓
                    </span>
                    <span className={habit.doneToday ? "text-gray-400 line-through" : ""}>
                      {habit.name}
                    </span>
                  </button>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${badge[habit.category]}`}>
                    {habit.category}
                  </span>
                  <span className="w-20 text-right text-sm text-orange-500">
                    🔥 {habit.streak} күн
                  </span>
                  <button
                    onClick={() => removeHabit(habit.id)}
                    className="text-gray-300 transition hover:text-red-500"
                    aria-label="Өшіру"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="py-6 text-center text-gray-400">Бұл категорияда әдет жоқ</li>
              )}
            </ul>

            {/* Қосу формасы */}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addHabit()}
                placeholder="Жаңа әдет атауы..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <button
                onClick={addHabit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-95"
              >
                + Қосу
              </button>
            </div>
          </section>

          {/* Күнтізбелік карта */}
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold">Соңғы 28 күн</h2>
            <p className="mb-4 text-sm text-gray-500">Түсі неғұрлым қою болса, соғұрлым көп орындалған</p>
            <Heatmap data={heatmapData} />
          </section>
        </div>
      </main>
    </div>
  );
}