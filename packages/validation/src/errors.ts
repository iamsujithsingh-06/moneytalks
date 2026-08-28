import { z } from "zod";

export interface ValidationDetail {
  field: string;
  issue: string;
  code: string;
}

export function formatZodError(error: z.ZodError): ValidationDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    issue: issue.message,
    code: issue.code,
  }));
}
