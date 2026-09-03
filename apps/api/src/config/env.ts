import "dotenv/config";
import { z } from "zod";

const booleanFromEnv = z
  .string()
  .transform((v) => v === "true" || v === "1")
  .pipe(z.boolean());

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/moneytalks"),
  JWT_SECRET: z.string().min(1).optional(),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGINS: z
    .string()
    .default(
      "http://localhost:5173,http://localhost:3000,http://localhost",
    ),
  AUTH_RATE_LIMIT_ENABLED: booleanFromEnv.default("true"),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  REGISTER_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(5),
  GENERAL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_SECONDS: z.coerce.number().int().positive().default(900),
});

export type Env = z.infer<typeof envSchema>;

export type RateLimitConfig = {
  enabled: boolean;
  authPerMinute: number;
  registerPerMinute: number;
  generalPerMinute: number;
};

export interface AppConfig {
  env: Env["NODE_ENV"];
  host: string;
  port: number;
  mongodbUri: string;
  jwt: {
    secret: Uint8Array;
    secretProvided: boolean;
    accessTtlSeconds: number;
  };
  refreshTokenTtlDays: number;
  logLevel: Env["LOG_LEVEL"];
  corsOrigins: string[];
  rateLimit: {
    enabled: boolean;
    authPerMinute: number;
    registerPerMinute: number;
    generalPerMinute: number;
  };
  bruteForce: {
    maxLoginAttempts: number;
    lockoutSeconds: number;
  };
  isProduction: boolean;
  isTest: boolean;
}

const DEV_SECRET_FALLBACK = "dev-only-insecure-secret-change-before-deploy-0000";

export function loadConfig(
  overrides: Record<string, string | undefined> = {},
): AppConfig {
  const parsed = envSchema.safeParse({ ...process.env, ...overrides });

  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `  - ${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === "production";
  const secret = env.JWT_SECRET ?? "";

  if (isProduction && secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be set to at least 32 characters in production",
    );
  }

  const secretProvided = secret.length > 0;
  const resolvedSecret = secretProvided ? secret : DEV_SECRET_FALLBACK;

  return {
    env: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    mongodbUri: env.MONGODB_URI,
    jwt: {
      secret: new TextEncoder().encode(resolvedSecret),
      secretProvided,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    },
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    logLevel: env.LOG_LEVEL,
    corsOrigins: env.CORS_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  rateLimit: {
    enabled: env.AUTH_RATE_LIMIT_ENABLED,
    authPerMinute: env.AUTH_RATE_LIMIT_PER_MINUTE,
    registerPerMinute: env.REGISTER_RATE_LIMIT_PER_MINUTE,
    generalPerMinute: env.GENERAL_RATE_LIMIT_PER_MINUTE,
  },
    bruteForce: {
      maxLoginAttempts: env.MAX_LOGIN_ATTEMPTS,
      lockoutSeconds: env.LOGIN_LOCKOUT_SECONDS,
    },
    isProduction,
    isTest: env.NODE_ENV === "test",
  };
}
