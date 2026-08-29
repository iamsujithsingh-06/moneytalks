import express, { type Express } from "express";
import type { AppConfig } from "./config/env.js";
import { createHttpLogger, type AppLogger } from "./lib/logger.js";
import { requestId } from "./middlewares/request-id.js";
import { securityHeaders } from "./middlewares/security-headers.js";
import { createCors } from "./middlewares/cors.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { notFoundHandler } from "./middlewares/not-found.js";
import { createV1Router } from "./routes/v1.js";
import { createHealthRouter } from "./modules/health/routes.js";
import { createAuthController } from "./modules/auth/controller.js";
import { AuthService } from "./modules/auth/service.js";
import { createTransactionsController } from "./modules/transactions/controller.js";
import { TransactionService } from "./modules/transactions/service.js";
import { createCategoriesController } from "./modules/categories/controller.js";
import { CategoryService } from "./modules/categories/service.js";
import { createPaymentMethodsController } from "./modules/payment-methods/controller.js";
import { PaymentMethodService } from "./modules/payment-methods/service.js";
import { createBudgetsController } from "./modules/budgets/controller.js";
import { BudgetService } from "./modules/budgets/service.js";
import { createAnalyticsController } from "./modules/analytics/controller.js";
import { AnalyticsService } from "./modules/analytics/service.js";
import { createDashboardController } from "./modules/dashboard/controller.js";
import { DashboardService } from "./modules/dashboard/service.js";
import { createSyncController } from "./modules/sync/controller.js";
import { SyncService } from "./modules/sync/service.js";
import { createIntelligenceController } from "./modules/intelligence/controller.js";
import { IntelligenceService } from "./modules/intelligence/service.js";
import { SlidingWindowRateLimiter } from "./lib/rate-limiter.js";
import type { RateLimitDeps } from "./middlewares/rate-limit.js";

export interface AppDeps {
  config: AppConfig;
  logger: AppLogger;
  /** Injectable for tests. When omitted, a default service is built. */
  authService?: AuthService;
  /** Injectable for tests. When omitted, a default service is built. */
  transactionsService?: TransactionService;
  /** Injectable for tests. When omitted, a default service is built. */
  categoriesService?: CategoryService;
  /** Injectable for tests. When omitted, a default service is built. */
  paymentMethodsService?: PaymentMethodService;
  /** Injectable for tests. When omitted, a default service is built. */
  budgetsService?: BudgetService;
  /** Injectable for tests. When omitted, a default service is built. */
  analyticsService?: AnalyticsService;
  /** Injectable for tests. When omitted, a default service is built. */
  dashboardService?: DashboardService;
  /** Injectable for tests. When omitted, a default service is built. */
  syncService?: SyncService;
  /** Injectable for tests. When omitted, a default service is built. */
  intelligenceService?: IntelligenceService;
  /** Injectable for tests. When omitted, limiters are built from config. */
  rateLimiters?: { auth: RateLimitDeps; register: RateLimitDeps };
  /**
   * Per-account login rate limiter shared with the auth service. Injectable so
   * tests can reset it between cases. When omitted, one is built from config.
   */
  accountRateLimiter?: SlidingWindowRateLimiter;
}

export function createApp(deps: AppDeps): Express {
  const { config, logger } = deps;

  const httpLogger = createHttpLogger(logger);

  const rateLimiters =
    deps.rateLimiters ?? {
      auth: {
        enabled: config.rateLimit.enabled,
        limiter: new SlidingWindowRateLimiter({
          windowMs: 60_000,
          max: config.rateLimit.authPerMinute,
        }),
      },
      register: {
        enabled: config.rateLimit.enabled,
        limiter: new SlidingWindowRateLimiter({
          windowMs: 60_000,
          max: config.rateLimit.registerPerMinute,
        }),
      },
    };

  const accountRateLimiter =
    deps.accountRateLimiter ??
    new SlidingWindowRateLimiter({
      windowMs: 60_000,
      max: config.rateLimit.authPerMinute,
    });

  const categoriesService =
    deps.categoriesService ??
    new CategoryService({
      logger,
    });

  const authService =
    deps.authService ??
    new AuthService({
      config,
      logger,
      accountRateLimiter,
      categoryService: categoriesService,
    });

  const authController = createAuthController(authService);

  const transactionsService =
    deps.transactionsService ??
    new TransactionService({
      logger,
    });

  const transactionsController = createTransactionsController(
    transactionsService,
  );

  const categoriesController = createCategoriesController(categoriesService);

  const paymentMethodsService =
    deps.paymentMethodsService ??
    new PaymentMethodService({
      logger,
    });

  const paymentMethodsController = createPaymentMethodsController(
    paymentMethodsService,
  );

  const budgetsService =
    deps.budgetsService ??
    new BudgetService({
      logger,
    });

  const budgetsController = createBudgetsController(budgetsService);

  const analyticsService =
    deps.analyticsService ??
    new AnalyticsService({
      logger,
    });

  const analyticsController = createAnalyticsController(analyticsService);

  const dashboardService =
    deps.dashboardService ??
    new DashboardService({
      logger,
      analyticsService,
      budgetService: budgetsService,
      transactionService: transactionsService,
    });

  const dashboardController = createDashboardController(dashboardService);

  const syncService =
    deps.syncService ??
    new SyncService({
      logger,
      transactionService: transactionsService,
      categoryService: categoriesService,
      paymentMethodService: paymentMethodsService,
    });

  const syncController = createSyncController(syncService);

  const intelligenceService =
    deps.intelligenceService ??
    new IntelligenceService({
      logger,
    });

  const intelligenceController = createIntelligenceController(
    intelligenceService,
  );

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.env === "production");

  app.use(requestId());
  app.use(httpLogger);
  app.use(securityHeaders());
  app.use(createCors(config));
  app.use(express.json({ limit: "100kb", strict: true }));

  app.use("/health", createHealthRouter());
  app.use(
    "/api/v1",
    createV1Router({
      auth: { controller: authController, config, rateLimiters },
      transactions: { controller: transactionsController, config },
      categories: { controller: categoriesController, config },
      paymentMethods: { controller: paymentMethodsController, config },
      budgets: { controller: budgetsController, config },
      analytics: { controller: analyticsController, config },
      dashboard: { controller: dashboardController, config },
      sync: { controller: syncController, config },
      intelligence: { controller: intelligenceController, config },
    }),
  );

  app.use(notFoundHandler());
  app.use(errorHandler(logger));

  return app;
}
