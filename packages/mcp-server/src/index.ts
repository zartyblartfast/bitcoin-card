import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runStdio } from "./server.js";

export { runStdio, createServer } from "./server.js";

const executedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
const modulePath = fileURLToPath(import.meta.url);

if (executedPath === modulePath) {
  runStdio().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
