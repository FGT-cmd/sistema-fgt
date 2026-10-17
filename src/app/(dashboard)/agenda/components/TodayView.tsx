import { todayView } from "@/lib/agenda/views";
import { ItemList,type ViewProps } from "./TaskRow";
export function TodayView(props: ViewProps) {
  const view=todayView(props.items,props.today);
  return <div className="space-y-6">
    {view.overdue.length>0&&<section>
      <h2 className="mb-3 font-semibold text-red-600">
        Atrasadas ·
        {view.overdue.length}
      </h2>
      <ItemList {...props} items={view.overdue} />
    </section>}
    <section>
      <h2 className="mb-3 font-semibold">
        Hoje
      </h2>
      <ItemList {...props} items={view.today} />
    </section>
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer font-semibold">
        Sem data ·
        {view.noDate.length}
      </summary>
      <div className="mt-3">
        <ItemList {...props} items={view.noDate} />
      </div>
    </details>
  </div>;
}
