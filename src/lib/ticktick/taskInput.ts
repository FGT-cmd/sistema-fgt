// Only explicitly editable task fields are accepted; sync linkage is server-owned.
export class TaskInputError extends Error {}
const has = (o: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(o,key);
export function parseTaskInput(input: unknown, creating = false) {
  if(!input || typeof input!=="object" || Array.isArray(input)) throw new TaskInputError("Corpo deve ser um objeto JSON");
  const b=input as Record<string,unknown>;
  const allowed=new Set(["title","description","dueDate","allDay","listName","priority","status","type","source","urgent","important","clientId"]);
  for(const key of Object.keys(b)) if(!allowed.has(key)) throw new TaskInputError(`Campo não permitido: ${key}`);
  const data: {title?:string;description?:string|null;dueDate?:Date|null;allDay?:boolean;listName?:string|null;priority?:string;status?:string;type?:string;source?:string;urgent?:boolean|null;important?:boolean|null;clientId?:string|null;completedAt?:Date|null}={};
  if(creating||has(b,"title")) {
    if(typeof b.title!=="string"||!b.title.trim()||b.title.length>2000) throw new TaskInputError("Título obrigatório (até 2000 caracteres)");
    data.title=b.title.trim();
  }
  for(const key of ["description","clientId"] as const) if(has(b,key)) {
    const value=b[key];
    if(value!==null&&typeof value!=="string") throw new TaskInputError(`${key} inválido`);
    if(typeof value==="string" && value.length>(key==="description"?50000:200)) throw new TaskInputError(`${key} muito longo`);
    data[key]=value||null;
  }
  for(const key of ["type","source"] as const) if(has(b,key)) {
    if(typeof b[key]!=="string"||!b[key].trim()||b[key].length>100) throw new TaskInputError(`${key} inválido`);
    data[key]=b[key];
  }
  if(has(b,"status")) {
    if(!["pending","waiting","done","cancelled"].includes(String(b.status))) throw new TaskInputError("Status inválido");
    data.status=String(b.status); data.completedAt=b.status==="done"?new Date():null;
  }
  if(has(b,"priority")) {
    if(!["alta","media","baixa","nenhuma","high","medium","low"].includes(String(b.priority))) throw new TaskInputError("Prioridade inválida");
    data.priority=String(b.priority);
  }
  if(has(b,"listName")) {
    if(b.listName!==null&&!['Work','Financeiro','Estudos'].includes(String(b.listName))) throw new TaskInputError("Lista inválida");
    data.listName=b.listName as string|null;
  }
  if(has(b,"allDay")) {
    if(typeof b.allDay!=="boolean") throw new TaskInputError("allDay deve ser booleano");
    data.allDay=b.allDay;
  }
  for(const key of ["urgent","important"] as const) if(has(b,key)) {
    if(b[key]!==null&&typeof b[key]!=="boolean") throw new TaskInputError(`${key} inválido`);
    data[key]=b[key] as boolean|null;
  }
  if(has(b,"dueDate")) {
    if(b.dueDate===null||b.dueDate==="") data.dueDate=null;
    else {
      if(typeof b.dueDate!=="string") throw new TaskInputError("Data inválida");
      const day=/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate);
      if(!day&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(b.dueDate)) throw new TaskInputError("Use data YYYY-MM-DD ou instante ISO com fuso");
      const calendarPart=b.dueDate.slice(0,10);
      const calendarDate=new Date(`${calendarPart}T00:00:00Z`);
      if(!Number.isFinite(calendarDate.getTime())||calendarDate.toISOString().slice(0,10)!==calendarPart) throw new TaskInputError("Data inválida");
      const date=new Date(day?`${b.dueDate}T00:00:00.000Z`:b.dueDate);
      if(!Number.isFinite(date.getTime())||(day&&date.toISOString().slice(0,10)!==b.dueDate)) throw new TaskInputError("Data inválida");
      if(day&&b.allDay===false) throw new TaskInputError("Informe horário e fuso para tarefa com horário");
      data.dueDate=date;
      if(!has(b,"allDay")) data.allDay=day;
    }
  }
  return data;
}
