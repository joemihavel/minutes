import { describe, expect, it } from "vitest";
import { DEFAULT_MODELS, MODEL_OPTIONS, defaultModel } from "./models";

describe("AI model routing", () => {
  it("uses GPT-OSS 120B as the default Groq Q&A model", () => {
    expect(defaultModel("groq", "chat")).toBe("openai/gpt-oss-120b");
    expect(DEFAULT_MODELS.groq.chat).toBe("openai/gpt-oss-120b");
  });

  it("offers both GPT-OSS sizes and keeps Qwen as an explicit fallback", () => {
    expect(MODEL_OPTIONS.groq.chat).toEqual([
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.6-27b",
    ]);
  });
});
