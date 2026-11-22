import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { migrate, pool } from "./db";
import { env } from "./env";
import { recoverRuns } from "./ia/runs";
import { startJobs } from "./jobs";
import { recordError, startMonitor } from "./lib/monitor";

await migrate();
const app = createApp();
const server = serve({ fetch: app.fetch, port: env.port, hostname: env.prod ? "0.0.0.0" : "127.0.0.1" }, (i) => console.log(`API em http://localhost:${i.port}`));
startJobs();
startMonitor();
await recoverRuns();
process.on("unhandledRejection", (e) => { console.error(e); recordError(e); });

const stop = async () => { server.close(); await pool.end(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
