import { runStdio } from "./server.js";

runStdio().catch((error) => {
  console.error(error);
  process.exit(1);
});
