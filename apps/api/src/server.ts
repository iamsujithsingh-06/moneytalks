import { loadConfig } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { registerShutdownHooks } from "./lib/shutdown.js";
import { connectDatabase, syncDbIndexes } from "./db/index.js";
import { createApp } from "./app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  await connectDatabase(config, logger);
  if (!config.isTest) {
    await syncDbIndexes(logger);
  }

  const app = createApp({ config, logger });
  const server = app.listen(config.port, config.host, () => {
    logger.info(
      { host: config.host, port: config.port, env: config.env },
      "MoneyTalks API listening",
    );
  });

  registerShutdownHooks(server, logger);
}

main().catch((err: unknown) => {
  const logger = createLogger(loadConfig());
  logger.fatal(
    { err: err instanceof Error ? err.message : String(err) },
    "Failed to start MoneyTalks API",
  );
  process.exit(1);
});
