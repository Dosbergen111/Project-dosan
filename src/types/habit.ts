export type Category = "Денсаулық" | "Оқу" | "Спорт" | "Басқа";

export interface Habit {
  id: number;
  name: string;
  category: Category;
  streak: number;
  doneToday: boolean;
}