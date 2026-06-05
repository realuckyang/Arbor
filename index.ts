// @ts-nocheck
import { startServer } from "./server/http.js";

const port = Number(process.env.ARBOR_PORT) || 9506;
await startServer(port);
