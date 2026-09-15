import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { config } from "../config.js";
import { logger } from "../logging/logger.js";

const lambda = new LambdaClient({ region: config.awsRegion });

/**
 * Hands a share to the background worker and returns immediately.
 *  - On AWS: an asynchronous ("Event") invoke of the worker Lambda. Lambda
 *    queues it durably and retries it twice on failure.
 *  - Locally: runs in this process, so `npm run dev` works end to end.
 */
export async function dispatchShare(shareId: string): Promise<void> {
  if (config.workerFunctionName) {
    await lambda.send(
      new InvokeCommand({
        FunctionName: config.workerFunctionName,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify({ shareId })),
      })
    );
    return;
  }
  // Imported lazily so the API Lambda never loads the research/LLM pipeline.
  const { processShare } = await import("./process.js");
  setImmediate(() => {
    processShare(shareId).catch((err) => logger.error({ err, shareId }, "local_worker_failed"));
  });
}
