import { describe, expect, it } from "vitest";
import { assertSecureApiBase } from "./client.js";

describe("assertSecureApiBase", () => {
  it("accepts a relative same-origin base URL in production", () => {
    expect(() => assertSecureApiBase("/api/v1", true)).not.toThrow();
  });

  it("accepts an HTTPS base URL in production", () => {
    expect(() => assertSecureApiBase("https://api.example.com/api/v1", true)).not.toThrow();
  });

  it("rejects plain HTTP base URL in production", () => {
    expect(() => assertSecureApiBase("http://10.94.30.121:3000/api/v1", true)).toThrow(
      /insecure HTTP API base URL/,
    );
  });

  it("allows http://localhost in dev tooling", () => {
    expect(() => assertSecureApiBase("http://localhost:3000/api/v1", false)).not.toThrow();
  });
});
