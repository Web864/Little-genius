import Fastify from 'fastify';
import { registerLocalRoutes } from './localAuth.js';
import { registerAicsRoutes } from './aicsRoutes.js';
export function createApp(pool,{logger=false}={}) {
const app = Fastify({ logger, bodyLimit: 64 * 1024 });
app.get('/api/health', async () => ({ ok: true, service: 'little-genius-local-api', mode: 'development' }));
app.get('/api/health/db', async (_request, reply) => {
  try {
    const { rows } = await pool.query('SELECT current_database() AS database, NOW() AS checked_at');
    return { ok: true, database: rows[0].database, checkedAt: rows[0].checked_at };
  } catch {
    return reply.code(503).send({ ok: false, error: 'Database unavailable' });
  }
});
registerLocalRoutes(app, pool);
registerAicsRoutes(app, pool);
app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Route not found.' }));
return app;
}
