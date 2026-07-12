import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { identifyRoute } from "./routes/identify.js";
import { researchRoute } from "./routes/research.js";

const app = Fastify({
  logger: true,
  bodyLimit: 15 * 1024 * 1024,
});

await app.register(cors, { origin: true });
await app.register(identifyRoute);
await app.register(researchRoute);

app.get("/health", async () => ({ ok: true }));

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`Consensus server on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
