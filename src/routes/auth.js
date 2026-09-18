import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { asyncHandler } from '../utils/async-handler.js';
import { signDeviceToken, signUserToken, verifyDeviceCredentials } from '../middleware/auth.js';

const router = Router();
const userLogin = z.object({ email: z.email(), password: z.string().min(8).max(100) }).strict();
const deviceLogin = z.object({ meterId: z.string().min(3).max(50), secret: z.string().min(12).max(100) }).strict();

router.post('/user-token', asyncHandler(async (request, response) => {
  const credentials = userLogin.parse(request.body);
  const result = await query('SELECT id, email, name, password_hash, role, province_id, district_id FROM users WHERE lower(email) = lower(?)', [credentials.email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(credentials.password, user.password_hash))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect');
  }
  response.json({ accessToken: signUserToken(user), tokenType: 'Bearer', expiresIn: 3600, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

router.post('/device-token', asyncHandler(async (request, response) => {
  const credentials = deviceLogin.parse(request.body);
  const installation = await verifyDeviceCredentials(credentials.meterId, credentials.secret);
  if (!installation) throw new ApiError(401, 'INVALID_CREDENTIALS', 'The meter ID or device secret is incorrect');
  response.json({ accessToken: signDeviceToken(installation), tokenType: 'Bearer', expiresIn: 3600, installationId: installation.id });
}));

export default router;
