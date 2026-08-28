import { hash, verify } from "@node-rs/argon2";

// Argon2id (the library default). Parameters target ~0.5-1s hashing.
const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hashed: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(hashed, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(hashed: string): boolean {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)/.exec(hashed);
  if (!match) return true;
  const [, m, t] = match;
  const memoryOk = Number(m) >= ARGON2_OPTIONS.memoryCost;
  const timeOk = Number(t) >= ARGON2_OPTIONS.timeCost;
  return !(memoryOk && timeOk);
}
