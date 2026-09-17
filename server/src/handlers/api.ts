import awsLambdaFastify from "@fastify/aws-lambda";
import { buildApp } from "../app.js";

/** Lambda entry for the HTTP API (behind a Lambda Function URL). Same Fastify app as `npm run dev`. */
const app = await buildApp();
// Respond as soon as the handler resolves. Otherwise Lambda waits for the event loop to drain,
// i.e. for the idle Postgres socket to time out (~20 s) on every request.
export const handler = awsLambdaFastify(app, { callbackWaitsForEmptyEventLoop: false });
await app.ready();
