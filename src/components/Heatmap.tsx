interface HeatmapProps {
  data: number[]; // әр күн үшін 0-3 аралығындағы мән
}

const colors = [
  "bg-gray-200",
  "bg-green-200",
  "bg-green-400",
  "bg-green-600",
];

export default function Heatmap({ data }: HeatmapProps) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {data.map((level, i) => (
        <div
          key={i}
          title={`${i + 1}-күн`}
          className={`aspect-square rounded-md ${colors[level]}`}
        />
      ))}
    </div>
  );
}