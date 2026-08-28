import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSyncRoutes } from './routes/sync.js';

migrate();

const app = Fastify({
  logger: true,
  bodyLimit: config.bodyLimitBytes, // 15 MB laut Spec (Puffer für base64-Anhänge im Push)
});

await app.register(fastifyCookie);

registerAuthRoutes(app);
registerSyncRoutes(app);

app.get('/api/health', async () => ({ ok: true }));

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
