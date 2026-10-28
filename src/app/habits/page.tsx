import Header from "../../components/Header";

const habits = [
  { name: "Су ішу", category: "Денсаулық", goal: 7, done: 5, streak: 5, created: "01.10.2026" },
  { name: "Кітап оқу", category: "Оқу", goal: 5, done: 5, streak: 12, created: "03.10.2026" },
  { name: "Таңертеңгі жаттығу", category: "Спорт", goal: 4, done: 2, streak: 3, created: "05.10.2026" },
  { name: "Ағылшын тілі", category: "Оқу", goal: 6, done: 3, streak: 7, created: "08.10.2026" },
];

const badge: Record<string, string> = {
  Денсаулық: "bg-blue-100 text-blue-700",
  Оқу: "bg-purple-100 text-purple-700",
  Спорт: "bg-orange-100 text-orange-700",
  Басқа: "bg-gray-100 text-gray-700",
};

export default function HabitsPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Header />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Менің әдеттерім</h2>
            <p className="text-sm text-gray-500">Барлығы: {habits.length} әдет</p>
          </div>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            + Жаңа әдет
          </button>
        </div>

        {/* Қосу формасы (макет) */}
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold">Жаңа әдет қосу</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              placeholder="Атауы"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
            />
            <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option>Денсаулық</option>
              <option>Оқу</option>
              <option>Спорт</option>
              <option>Басқа</option>
            </select>
            <input
              type="number"
              placeholder="Аптасына (рет)"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Сақтау
          </button>
        </section>

        {/* Әдеттер карточкалары */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {habits.map((h) => {
            const percent = Math.round((h.done / h.goal) * 100);
            return (
              <div key={h.name} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{h.name}</h3>
                    <p className="text-xs text-gray-400">Құрылған: {h.created}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${badge[h.category]}`}>
                    {h.category}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-gray-500">
                      Апталық мақсат: {h.done}/{h.goal}
                    </span>
                    <span className="font-medium">{percent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm text-orange-500">🔥 {h.streak} күн қатарынан</span>
                  <div className="flex gap-2 text-sm">
                    <button className="rounded-lg bg-gray-100 px-3 py-1 hover:bg-gray-200">
                      Өзгерту
                    </button>
                    <button className="rounded-lg bg-red-50 px-3 py-1 text-red-600 hover:bg-red-100">
                      Өшіру
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}