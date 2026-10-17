import { weekView } from "@/lib/agenda/views";
import { ItemList,type ViewProps } from "./TaskRow";
export function dayLabel(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR",{
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC"
  });
}
export function WeekView(props: ViewProps) {
  return <div className="grid min-w-0 gap-3 xl:grid-cols-7">
    {weekView(props.items,props.today).map(day => <section key={day.day} className="min-w-0 rounded-2xl bg-gray-50 p-2">
      <h2 className="px-1 py-3 text-sm font-semibold">
        {dayLabel(day.day)}
      </h2>
      <ItemList {...props} items={day.items} />
    </section>)}
  </div>;
}
