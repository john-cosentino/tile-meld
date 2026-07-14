import { buildApp } from "./app.js";
import { createDb } from "./db/connection.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app = await buildApp({ db, env });

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`tile-meld server listening on port ${env.PORT}`))
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
