import { describe, expect, it } from "vitest";
import { EvidenceAnswerValidationError } from "../src/agents/evidence-answer-generator.js";
import { safeFallbackReason } from "../src/llm/openai-evidence-answer-generator.js";

describe("safeFallbackReason", () => {
  it("classifies failures without returning the original message", () => {
    const reason = safeFallbackReason(
      new Error("request failed with sk-secret-value in Authorization"),
    );

    expect(reason).toBe("llm request failed");
    expect(reason).not.toContain("secret");
    expect(reason).not.toContain("Authorization");
  });

  it("classifies timeout and invalid output", () => {
    const timeout = new Error("request contained sensitive details");
    timeout.name = "TimeoutError";

    expect(safeFallbackReason(timeout)).toBe("llm timeout");
    expect(
      safeFallbackReason(new EvidenceAnswerValidationError("bad secret output")),
    ).toBe("llm invalid output");
  });

  it("classifies HTTP failures using status only", () => {
    expect(safeFallbackReason({ status: 401, message: "secret" })).toBe(
      "llm authentication failed",
    );
    expect(safeFallbackReason({ status: 429, message: "secret" })).toBe(
      "llm rate limited",
    );
    expect(safeFallbackReason({ status: 503, message: "secret" })).toBe(
      "llm unavailable",
    );
  });
});
