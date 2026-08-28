import type { HydratedDocument } from "mongoose";

export interface AuthContext {
  userId: string;
  deviceId: string;
  tokenVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: AuthContext;
      validatedBody?: unknown;
      validatedQuery?: unknown;
      validatedParams?: unknown;
    }
  }
}

export type { HydratedDocument };
