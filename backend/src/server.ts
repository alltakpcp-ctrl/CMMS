import { app } from "./app";
import { env } from "./config/env";

app.listen(env.port, () => {
  console.log(`CMMS backend rodando em http://localhost:${env.port}`);
});
