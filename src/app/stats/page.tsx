import Header from "../../components/Header";
import Heatmap from "../../components/Heatmap";

const week = [
  { day: "Дс", value: 4 },
  { day: "Сс", value: 3 },
  { day: "Ср", value: 5 },
  { day: "Бс", value: 2 },
  { day: "Жм", value: 4 },
  { day: "Сб", value: 1 },
  { day: "Жс", value: 3 },
];
const totalHabits = 5;

const categories = [
  { name: "Денсаулық", percent: 85, color: "bg-blue-500" },
  { name: "Оқу", percent: 70, color: "bg-purple-500" },
  { name: "Спорт", percent: 40, color: "bg-orange-500" },
  { name: "Басқа", percent: 55, color: "bg-gray-500" },
];

const topStreaks = [
  { name: "Кітап оқу", days: 12 },
  { name: "Ағылшын тілі", days: 7 },
  { name: "Су ішу", days: 5 },
];

const heatmapData = Array.from({ length: 28 }, (_, i) => (i * 7 + 3) % 4);

export default function StatsPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Header />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <h2 className="text-2xl font-bold">Статистика</h2>

        {/* Жиынтық карточкалар */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Осы апта</p>
            <p className="mt-1 text-3xl font-bold text-indigo-600">78%</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Осы ай</p>
            <p className="mt-1 text-3xl font-bold text-green-600">64%</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Ең ұзақ streak</p>
            <p className="mt-1 text-3xl font-bold text-orange-500">12 күн</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Барлық әдет</p>
            <p className="mt-1 text-3xl font-bold">{totalHabits}</p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Апталық график */}
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold">Апталық орындалу</h3>
            <div className="flex h-48 items-end justify-between gap-2">
              {week.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs text-gray-500">{d.value}</span>
                  <div
                    className="w-full rounded-t-lg bg-indigo-500"
                    style={{ height: `${(d.value / totalHabits) * 100}%` }}
                  />
                  <span className="text-xs text-gray-500">{d.day}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Категория бойынша */}
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold">Категория бойынша</h3>
            <div className="space-y-4">
              {categories.map((c) => (
                <div key={c.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="font-medium">{c.percent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full ${c.color}`}
                      style={{ width: `${c.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Күнтізбелік карта */}
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-1 font-semibold">Соңғы 28 күн</h3>
            <p className="mb-4 text-sm text-gray-500">Түсі қою болған сайын көп орындалған</p>
            <Heatmap data={heatmapData} />
          </section>

          {/* Үздік streak */}
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold">🏆 Үздік streak</h3>
            <ul className="divide-y">
              {topStreaks.map((s, i) => (
                <li key={s.name} className="flex items-center justify-between py-3">
                  <span>
                    <span className="mr-3 text-gray-400">{i + 1}.</span>
                    {s.name}
                  </span>
                  <span className="text-orange-500">🔥 {s.days} күн</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}