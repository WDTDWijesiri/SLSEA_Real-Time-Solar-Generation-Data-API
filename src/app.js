import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import fs from 'node:fs';
import { config } from './config.js';
import { query } from './db.js';
import authRoutes from './routes/auth.js';
import geographyRoutes from './routes/geography.js';
import installationRoutes from './routes/installations.js';
import readingRoutes from './routes/readings.js';
import summaryRoutes from './routes/summaries.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { requestContext } from './middleware/request-context.js';
import { requireJson } from './utils/http.js';
import { ApiError } from './errors.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const openapi = YAML.parse(fs.readFileSync(path.join(directory, '../openapi.yaml'), 'utf8'));

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json({ limit: '64kb' }));
  app.use(requestContext);
  app.use((request, _response, next) => {
    if (!request.accepts(['json', 'html']) && request.path !== '/openapi.yaml') return next(new ApiError(406, 'NOT_ACCEPTABLE', 'This API provides JSON representations'));
    next();
  });
  app.use(requireJson);

  app.get('/health', async (_request, response) => {
    await query('SELECT 1');
    response.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.get('/openapi.yaml', (_request, response) => response.type('application/yaml').send(YAML.stringify(openapi)));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'Real-Time-Solar-Generation-Data-API' }));

  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
  app.use('/api/v1/auth', authLimiter, authRoutes);
  app.use('/api/v1', geographyRoutes, installationRoutes, readingRoutes, summaryRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export function deploymentFingerprint() {
  return crypto.createHash('sha256').update(JSON.stringify(openapi)).digest('hex').slice(0, 12);
}
