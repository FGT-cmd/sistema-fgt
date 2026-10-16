import { describe, it, expect } from "vitest";
import { InterpretError } from "./interpret";

describe("InterpretError", () => {
  it("carries the stop reason when given one", () => {
    const err = new InterpretError("stop_reason=max_tokens", { stopReason: "max_tokens" });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("stop_reason=max_tokens");
    expect(err.stopReason).toBe("max_tokens");
  });

  it("has no stop reason by default", () => {
    expect(new InterpretError("resposta sem texto").stopReason).toBeUndefined();
  });
});
