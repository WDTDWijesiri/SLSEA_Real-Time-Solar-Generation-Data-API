import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { query } from '../db.js';
import { ApiError, forbidden } from '../errors.js';
import { asyncHandler } from '../utils/async-handler.js';

function bearerToken(request) {
  const header = request.get('Authorization');
  if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'A Bearer token is required');
  return header.slice(7);
}

export function authenticateUser(request, _response, next) {
  try {
    const payload = jwt.verify(bearerToken(request), config.jwtSecret, { issuer: 'slsea-api', audience: 'slsea-users' });
    if (payload.type !== 'user') throw new Error('Wrong token type');
    request.auth = payload;
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(new ApiError(401, 'INVALID_TOKEN', 'The access token is invalid or expired'));
  }
}

export const authenticateDevice = asyncHandler(async (request, _response, next) => {
  let payload;
  try {
    payload = jwt.verify(bearerToken(request), config.jwtSecret, { issuer: 'slsea-api', audience: 'metering-devices' });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'INVALID_TOKEN', 'The device token is invalid or expired');
  }
  if (payload.type !== 'device' || Number(payload.installationId) !== Number(request.params.installationId)) {
    throw forbidden('A device may submit readings only for its own installation');
  }
  request.auth = payload;
  next();
});

export const verifyDeviceCredentials = async (meterId, secret) => {
  const result = await query('SELECT id, meter_id, device_secret_hash, status FROM solar_installations WHERE meter_id = ?', [meterId]);
  const installation = result.rows[0];
  if (!installation || !(await bcrypt.compare(secret, installation.device_secret_hash))) return null;
  if (installation.status !== 'active') throw forbidden('This installation is not active');
  return installation;
};

export function signUserToken(user) {
  return jwt.sign({ type: 'user', role: user.role, provinceId: user.province_id, districtId: user.district_id }, config.jwtSecret, {
    subject: String(user.id), issuer: 'slsea-api', audience: 'slsea-users', expiresIn: config.jwtExpiresIn
  });
}

export function signDeviceToken(installation) {
  return jwt.sign({ type: 'device', installationId: installation.id }, config.jwtSecret, {
    subject: installation.meter_id, issuer: 'slsea-api', audience: 'metering-devices', expiresIn: config.jwtExpiresIn
  });
}
