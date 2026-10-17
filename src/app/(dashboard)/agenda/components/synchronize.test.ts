import { describe,it,expect,vi } from "vitest";
import { settleSync } from "./synchronize";
describe("synchronization refresh",() => {
  it("retries after the background runner releases its lock",async () => {
    const request=vi.fn().mockResolvedValueOnce({
      skipped: "running"
    }).mockResolvedValueOnce({}).mockResolvedValueOnce({
      skipped: "running"
    }).mockResolvedValueOnce({}).mockResolvedValue({
      ok: true
    });
    const pause=vi.fn().mockResolvedValue(undefined);
    await settleSync(request,pause);
    expect(request).toHaveBeenCalledTimes(5);
    expect(pause).toHaveBeenCalledTimes(2);
  });
  it("bounds polling and keeps disabled installations usable",async () => {
    const request=vi.fn().mockResolvedValue({
      skipped: "running"
    });
    await expect(settleSync(request,async () => { })).rejects.toThrow("ainda está em andamento");
    expect(request).toHaveBeenCalledTimes(40);
    await expect(settleSync(vi.fn().mockResolvedValue({
      skipped: "disabled",
      enabled: false
    }))).resolves.toBeUndefined();
  });
});
