import crypto from 'node:crypto';
import { URL } from 'node:url';
import { ApiError } from '../errors.js';

export function buildPageLinks(request, page, pageSize, total) {
  const pageCount = Math.ceil(total / pageSize);
  const makeLink = (target) => {
    const url = new URL(`${request.protocol}://${request.get('host')}${request.originalUrl}`);
    url.searchParams.set('page', String(target));
    url.searchParams.set('pageSize', String(pageSize));
    return url.toString();
  };
  return {
    self: makeLink(page),
    next: page < pageCount ? makeLink(page + 1) : null,
    previous: page > 1 && pageCount > 0 ? makeLink(page - 1) : null
  };
}

export function resourceLink(request, path, method = 'GET') {
  const href = new URL(path, `${request.protocol}://${request.get('host')}`).toString();
  return { href, method };
}

export function buildHypermediaPageLinks(request, page, pageSize, total) {
  const links = buildPageLinks(request, page, pageSize, total);
  return Object.fromEntries(
    Object.entries(links)
      .filter(([, href]) => href)
      .map(([relation, href]) => [relation, { href, method: 'GET' }])
  );
}

export function withLinks(resource, links) {
  return { ...resource, _links: links };
}

export function sendCacheable(request, response, body, lastModified) {
  const etag = `"${crypto.createHash('sha256').update(JSON.stringify(body)).digest('base64url')}"`;
  const modified = new Date(lastModified ?? 0);
  const httpModifiedTime = Math.floor(modified.getTime() / 1000) * 1000;
  response.set('ETag', etag);
  if (!Number.isNaN(httpModifiedTime) && httpModifiedTime > 0) response.set('Last-Modified', new Date(httpModifiedTime).toUTCString());

  const noneMatch = request.get('If-None-Match');
  const ifMatch = request.get('If-Match');
  const modifiedSince = request.get('If-Modified-Since');
  const matchCandidates = ifMatch?.split(',').map((value) => value.trim()) ?? [];
  if (ifMatch && ifMatch !== '*' && !matchCandidates.includes(etag)) {
    throw new ApiError(412, 'PRECONDITION_FAILED', 'The current representation does not match If-Match', [{ header: 'If-Match', currentETag: etag }]);
  }
  const etagMatches = noneMatch && noneMatch.split(',').map((value) => value.trim()).includes(etag);
  const dateMatches = !noneMatch && modifiedSince && httpModifiedTime <= new Date(modifiedSince).getTime();
  if (etagMatches || dateMatches) return response.status(304).end();
  return response.json(body);
}

export function requireJson(request, _response, next) {
  if (request.method !== 'GET' && request.method !== 'HEAD' && !request.is('application/json')) {
    return next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
  }
  next();
}
