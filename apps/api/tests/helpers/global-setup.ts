import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer | undefined;

/**
 * Boots an in-memory MongoDB when no external MONGODB_URI is configured, so
 * the integration tests are self-contained and deterministic.
 */
export default async function setup(): Promise<() => Promise<void>> {
  if (!process.env.MONGODB_URI) {
    mongod = await MongoMemoryServer.create({
      instance: { dbName: "moneytalks_test" },
    });
    process.env.MONGODB_URI = mongod.getUri("moneytalks_test");
  }

  return async () => {
    await mongod?.stop();
  };
}
