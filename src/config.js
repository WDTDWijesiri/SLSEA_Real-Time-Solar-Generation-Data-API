import 'dotenv/config';

const isTest = process.env.NODE_ENV === 'test';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL,
  mysql: {
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    database: process.env.MYSQL_DATABASE ?? 'slsea_solar',
    user: process.env.DB_USER ?? process.env.MYSQL_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD ?? ''
  },
  jwtSecret: process.env.JWT_SECRET ?? (isTest ? 'test-secret-at-least-thirty-two-characters' : ''),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  trustProxy: Number(process.env.TRUST_PROXY ?? 0)
};

if (!config.jwtSecret || config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters');
}
