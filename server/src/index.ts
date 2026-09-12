import { config } from "./config.js";
import { buildApp } from "./app.js";

const app = await buildApp();

try {
  const address = await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info({ address }, "server_started");
} catch (error) {
  app.log.error(error, "server_start_failed");
  process.exit(1);
}
