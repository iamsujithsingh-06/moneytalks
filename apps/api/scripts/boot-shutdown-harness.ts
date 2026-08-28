import { MongoMemoryServer } from "mongodb-memory-server";
import { loadConfig } from "../src/config/env.js";
import { createLogger } from "../src/lib/logger.js";
import { registerShutdownHooks } from "../src/lib/shutdown.js";
import { connectDatabase, syncDbIndexes } from "../src/db/index.js";
import { createApp } from "../src/app.js";

const mongod = await MongoMemoryServer.create({
  instance: { dbName: "moneytalks" },
});
const uri = mongod.getUri("moneytalks");

const config = loadConfig({
  NODE_ENV: "development",
  HOST: "127.0.0.1",
  PORT: "34570",
  MONGODB_URI: uri,
  JWT_SECRET: "boot-check-secret-0123456789abcdef-0123456789abcdef",
  LOG_LEVEL: "info",
} as unknown as Record<string, string | undefined>);
const logger = createLogger(config);

await connectDatabase(config, logger);
await syncDbIndexes(logger);

const app = createApp({ config, logger });
const server = app.listen(config.port, config.host, () => {
  void (async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${config.port}/health`);
      const body = (await res.json()) as { status?: string };
      console.log(`HEALTH_STATUS ${res.status} ${JSON.stringify(body)}`);
      if (res.status !== 200 || body.status !== "ok") {
        console.log("BOOT_VERIFICATION_FAILED");
        process.exit(1);
      }
      console.log("BOOT_VERIFICATION_OK");
    } catch (err) {
      console.log(`BOOT_VERIFICATION_FAILED ${String(err)}`);
      process.exit(1);
    }

    const shutdown = registerShutdownHooks(server, logger);
    setTimeout(() => shutdown("SIGINT"), 500);
  })();
});
