import { matrixView } from "@/lib/agenda/views";
import { ItemList,priorityColors,type ViewProps } from "./TaskRow";
export function MatrixView(props: ViewProps) {
  const view=matrixView(props.items);
  const quadrants=[{
    key: "q1",
    title: "Urgente e importante",
    priority: "alta"
  },{
    key: "q2",
    title: "Importante, não urgente",
    priority: "media"
  },{
    key: "q3",
    title: "Urgente, não importante",
    priority: "baixa"
  },{
    key: "q4",
    title: "Nem urgente nem importante",
    priority: "nenhuma"
  }] as const;
  return <div className="grid gap-4 md:grid-cols-2">
    {quadrants.map(q => <section key={q.key} className="min-w-0 rounded-2xl border-t-4 bg-gray-50 p-4" style={{
      borderColor: priorityColors[q.priority]
    }}>
      <h2 className="mb-3 font-semibold">
        {q.title}
        ·
        {view[q.key].length}
      </h2>
      <ItemList {...props} items={view[q.key]} />
    </section>)}
  </div>;
}
