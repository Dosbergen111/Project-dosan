const habits = [
  { name: "Су ішу", streak: 5, done: true },
  { name: "Кітап оқу", streak: 12, done: true },
  { name: "Таңертеңгі жаттығу", streak: 3, done: false },
  { name: "Ағылшын тілі", streak: 7, done: false },
];

const days = ["Дс", "Сс", "Ср", "Бс", "Жм", "Сб", "Жс"];

export default function Home() {
  const doneCount = habits.filter((h) => h.done).length;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-indigo-600 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Habit Tracker</h1>
          <nav className="flex gap-4 text-sm">
            <a href="#" className="font-semibold underline">Басты бет</a>
            <a href="#" className="opacity-80 hover:opacity-100">Әдеттер</a>
            <a href="#" className="opacity-80 hover:opacity-100">Статистика</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Бүгін орындалды</p>
            <p className="mt-1 text-3xl font-bold text-indigo-600">
              {doneCount}/{habits.length}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Ең ұзақ streak</p>
            <p className="mt-1 text-3xl font-bold text-orange-500">12 күн</p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Осы апта</p>
            <p className="mt-1 text-3xl font-bold text-green-600">78%</p>
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Бүгінгі әдеттер</h2>
            <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              + Әдет қосу
            </button>
          </div>

          <ul className="divide-y">
            {habits.map((habit) => (
              <li key={habit.name} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm ${
                      habit.done
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-gray-300 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className={habit.done ? "text-gray-400 line-through" : ""}>
                    {habit.name}
                  </span>
                </div>
                <span className="text-sm text-orange-500">🔥 {habit.streak} күн</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="mb-4 text-lg font-semibold">Осы апта</h2>
          <div className="grid grid-cols-7 gap-2 text-center text-sm">
            {days.map((day, i) => (
              <div key={day}>
                <p className="mb-1 text-gray-500">{day}</p>
                <div
                  className={`h-10 rounded-lg ${
                    i < 5 ? "bg-green-400" : "bg-gray-200"
                  }`}
                />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}