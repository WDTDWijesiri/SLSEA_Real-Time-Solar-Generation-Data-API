import { ZodError } from 'zod';
import { ApiError } from '../errors.js';

export function notFoundHandler(request, _response, next) {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `No route matches ${request.method} ${request.originalUrl}`));
}

export function errorHandler(error, request, response, _next) {
  let normalized = error;
  if (error instanceof ZodError) {
    normalized = new ApiError(400, 'VALIDATION_ERROR', 'The request contains invalid values', error.issues.map((issue) => ({ field: issue.path.join('.'), issue: issue.message })));
  } else if (error.code === 'ER_DUP_ENTRY') {
    normalized = new ApiError(409, 'RESOURCE_CONFLICT', 'A resource with the same unique value already exists');
  } else if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_ROW_IS_REFERENCED_2') {
    normalized = new ApiError(400, 'INVALID_REFERENCE', 'A referenced resource does not exist');
  } else if (!(error instanceof ApiError)) {
    console.error(error);
    normalized = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }

  const body = {
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
      requestId: request.id
    }
  };
  response.status(normalized.status).json(body);
}
