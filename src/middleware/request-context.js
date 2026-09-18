import crypto from 'node:crypto';

export function requestContext(request, response, next) {
  request.id = request.get('X-Request-ID') ?? crypto.randomUUID();
  response.set('X-Request-ID', request.id);
  next();
}
