import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ rows: vi.fn(), user: vi.fn(), events: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/prisma", () => ({prisma:{todoTask:{findMany:mocks.rows}}}));
vi.mock("@/lib/user", () => ({getDefaultUser:mocks.user}));
vi.mock("@/lib/google-calendar", () => ({listCalendarEvents:mocks.events}));
vi.mock("@/lib/ticktick/syncRunner", () => ({getSyncStatus:mocks.sync}));
import { GET } from "@/app/api/agenda/items/route";
const get = (from:string,to:string) => GET(new NextRequest(`http://offline.test/api/agenda/items?from=${from}&to=${to}`));
beforeEach(() => {vi.clearAllMocks();mocks.user.mockResolvedValue({id:"owner"});mocks.rows.mockResolvedValue([]);mocks.events.mockResolvedValue([]);mocks.sync.mockResolvedValue({enabled:false});});
describe("agenda items route (all services mocked)", () => {
 it("rejects impossible and unbounded ranges before touching services", async () => {
 for(const [from,to] of [["2026-02-30","2026-03-02"],["2026-10-17","2026-10-16"],["2026-01-01","2027-01-03"]]) expect((await get(from,to)).status).toBe(400);
 expect(mocks.user).not.toHaveBeenCalled();
 });
 it("loads all open owner tasks and requests exclusive Google boundaries", async () => {
 mocks.rows.mockResolvedValue([{id:"t",title:"Sem data",description:null,dueDate:null,allDay:true,priority:"high",listName:"Work",status:"pending",isRecurring:false,urgent:false,important:false}]);
 const response = await get("2026-10-16","2026-10-17");
 expect(response.status).toBe(200);
 expect(mocks.rows).toHaveBeenCalledWith({where:{userId:"owner",status:{in:["pending","waiting"]}}});
 expect(mocks.events).toHaveBeenCalledWith("2026-10-16T00:00:00-03:00","2026-10-18T00:00:00-03:00",{strictRefreshErrors:true,exposeCalendarApiErrors:true});
 expect((await response.json()).items[0]).toMatchObject({priority:"alta",urgent:false,important:false});
 });
 it("surfaces Google failure while preserving local tasks and hides internals", async () => {
 mocks.events.mockRejectedValue(new Error("secret token backend detail"));
 const data=await (await get("2026-10-16","2026-10-17")).json();
 expect(data.googleError).toContain("Não foi possível");
 expect(JSON.stringify(data)).not.toContain("secret");
 });
 it("returns explicit error on DB failure instead of an empty agenda", async () => {
 mocks.rows.mockRejectedValueOnce(new Error("secret database connection"));
 const response=await get("2026-10-16","2026-10-17");
 expect(response.status).toBe(500);
 expect(JSON.stringify(await response.json())).not.toContain("secret");
 });
});
