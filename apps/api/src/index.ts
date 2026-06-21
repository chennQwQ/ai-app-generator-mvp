import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const config = loadConfig();
const app = await createServer(config);

await app.listen({ host: config.apiHost, port: config.apiPort });
