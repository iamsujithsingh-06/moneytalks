import { describe, expect, it } from "vitest";
import {
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "../../src/lib/password.js";

describe("password hashing (Argon2id)", () => {
  it("hashes a password to an argon2id string", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple1");
    expect(hash.startsWith("$argon2id$v=19$")).toBe(true);
    expect(hash).not.toContain("CorrectHorseBatteryStaple1");
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple1");
    expect(await verifyPassword(hash, "CorrectHorseBatteryStaple1")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple1");
    expect(await verifyPassword(hash, "WrongPassword1")).toBe(false);
  });

  it("returns false for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "CorrectHorseBatteryStaple1")).toBe(
      false,
    );
  });

  it("produces unique salts for the same password", async () => {
    const [a, b] = await Promise.all([
      hashPassword("CorrectHorseBatteryStaple1"),
      hashPassword("CorrectHorseBatteryStaple1"),
    ]);
    expect(a).not.toBe(b);
  });

  it("detects outdated parameters for rehash", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple1");
    expect(passwordNeedsRehash(hash)).toBe(false);
    expect(passwordNeedsRehash("$argon2id$v=19$m=2048,t=1,p=1$...")).toBe(true);
  });
});
