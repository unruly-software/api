export class APIClientError extends Error {}

export class APIClientRequestParsingError extends APIClientError {
  readonly previousError: Error;
  readonly endpoint: string;

  constructor(options: { previousError: Error; endpoint: string }) {
    super(`Request parsing failed for endpoint "${options.endpoint}"`);
    this.name = 'APIClientRequestParsingError';
    this.previousError = options.previousError;
    this.endpoint = options.endpoint;
  }
}

export class APIClientResponseParsingError extends APIClientError {
  readonly previousError: Error;
  readonly endpoint: string;

  constructor(options: { previousError: Error; endpoint: string }) {
    super(`Response parsing failed for endpoint "${options.endpoint}"`);
    this.name = 'APIClientResponseParsingError';
    this.previousError = options.previousError;
    this.endpoint = options.endpoint;
  }
}
