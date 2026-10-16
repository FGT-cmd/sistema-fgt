import { describe, it, expect } from "vitest";
import { isAllowedChat, secretTokenMatches } from "./telegramWebhookAuth";

describe("webhook do Telegram", () => {
  it("chat liberado só quando TELEGRAM_ALLOWED_CHAT existe e bate", () => {
    expect(isAllowedChat("123", "123")).toBe(true);
    expect(isAllowedChat("999", "123")).toBe(false);
    expect(isAllowedChat("123", undefined)).toBe(false);
    expect(isAllowedChat("", "")).toBe(false);
  });

  it("secret token: igual passa; diferente, de outro tamanho ou ausente não", () => {
    expect(secretTokenMatches("s3cr3t", "s3cr3t")).toBe(true);
    expect(secretTokenMatches("s3cr3x", "s3cr3t")).toBe(false);
    expect(secretTokenMatches("s3cr3t-longer", "s3cr3t")).toBe(false);
    expect(secretTokenMatches(null, "s3cr3t")).toBe(false);
    expect(secretTokenMatches("", "s3cr3t")).toBe(false);
  });
});
