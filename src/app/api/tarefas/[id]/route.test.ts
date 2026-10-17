import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m=vi.hoisted(()=>({find:vi.fn(),del:vi.fn(),remote:vi.fn(),update:vi.fn(),after:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{todoTask:{findFirst:m.find,deleteMany:m.del,update:m.update}}}));
vi.mock("@/lib/user",()=>({getDefaultUser:async()=>({id:"owner"})}));
vi.mock("@/lib/ticktick/syncRunner",()=>({deleteRemoteFor:m.remote,runTickTickSync:vi.fn()}));
vi.mock("next/server",async importOriginal=>({...await importOriginal<typeof import("next/server")>(),after:m.after}));
import { DELETE, PATCH } from "./route";
describe("owner task routes",()=>{
 beforeEach(()=>{vi.resetAllMocks();m.find.mockResolvedValue({id:"t",userId:"owner",updatedAt:new Date(),tickTickId:"r",tickTickProjectId:"w"});});
 it("does not remove local task if remote deletion fails",async()=>{
  m.remote.mockRejectedValue(new Error("remote unavailable"));
  const response=await DELETE(new NextRequest("https://local/api/tarefas/t",{method:"DELETE"}),{params:Promise.resolve({id:"t"})});
  expect(response.status).toBe(502);expect(m.del).not.toHaveBeenCalled();expect(m.remote).toHaveBeenCalledWith("t","owner",expect.any(Function));
 });
 it("does not look up or delete another owner task",async()=>{
  m.find.mockResolvedValue(null);
  const response=await DELETE(new NextRequest("https://local/api/tarefas/t",{method:"DELETE"}),{params:Promise.resolve({id:"t"})});
  expect(response.status).toBe(404);expect(m.find).toHaveBeenCalledWith({where:{id:"t",userId:"owner"}});expect(m.remote).not.toHaveBeenCalled();
 });
 it("validates patch input before any write",async()=>{
  const response=await PATCH(new NextRequest("https://local/api/tarefas/t",{method:"PATCH",body:JSON.stringify({priority:"bad"})}),{params:Promise.resolve({id:"t"})});
  expect(response.status).toBe(400);expect(m.update).not.toHaveBeenCalled();
 });
});
