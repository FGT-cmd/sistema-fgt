import { describe, it, expect } from "vitest";
import { parseTaskInput } from "./taskInput";
describe("task input",()=>{
 it("infers legacy date-only as whole day and timed ISO as timed",()=>{
  expect(parseTaskInput({title:"t",dueDate:"2026-10-17"},true)).toMatchObject({allDay:true,dueDate:new Date("2026-10-17T00:00:00Z")});
  expect(parseTaskInput({title:"t",dueDate:"2026-10-17T12:00:00-03:00"},true)).toMatchObject({allDay:false,dueDate:new Date("2026-10-17T15:00:00Z")});
 });
 it("respects explicit allDay",()=>expect(parseTaskInput({dueDate:"2026-10-17T03:00:00Z",allDay:true}).allDay).toBe(true));
 it("rejects impossible dates, missing timezone, invalid list and priority",()=>{
  for(const body of [{dueDate:"2026-02-30"},{dueDate:"2026-10-17T12:00:00"},{listName:"Pessoal"},{priority:"bad"},{userId:"other"},{allDay:"false"}]) expect(()=>parseTaskInput(body)).toThrow();
 });
 it("preserves explicit urgency and importance and does not invent patch fields",()=>{
  expect(parseTaskInput({urgent:false,important:true})).toEqual({urgent:false,important:true});
  expect(parseTaskInput({title:"edit"})).toEqual({title:"edit"});
 });
});
