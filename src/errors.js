export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (resource) => new ApiError(404, 'RESOURCE_NOT_FOUND', `${resource} was not found`);
export const forbidden = (message = 'You are not permitted to access this resource') => new ApiError(403, 'FORBIDDEN', message);
