import helmet from "helmet";
import type { RequestHandler } from "express";

/**
 * Security headers for a JSON API. CSP is disabled because the API never
 * renders HTML; HSTS/frameguard/nosniff/referrer policy are enforced.
 */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 60 * 60 * 24 * 365,
      includeSubDomains: true,
      preload: true,
    },
  });
}
