import type { EndpointDefinition } from './endpoint';
import {
  APIClientRequestParsingError,
  APIClientResponseParsingError,
} from './errors';
import type {
  SchemaInferInput,
  SchemaInferOutput,
  SchemaValue,
} from './schema';
import { type ErrorMessage, makeTopic, type SuccessMessage } from './topic';
import type {
  APIClientConfig,
  APIEndpointDefinitions,
  ErrorFormatter,
  RequestOptions,
} from './types';

export type APIEndpointDefinitionWithMetadata<
  T extends Record<string, unknown>,
> = Record<string, EndpointDefinition<SchemaValue, SchemaValue, T>>;

export type {
  APIClientConfig,
  APIEndpointDefinitions,
  APIResolver,
  ErrorFormatter,
  RequestOptions,
} from './types';

export class APIClient<T extends APIEndpointDefinitions> {
  constructor(
    private definitions: T,
    private config: APIClientConfig<T>,
  ) {}

  $failed = makeTopic<ErrorMessage<T>>();

  $succeeded = makeTopic<SuccessMessage<T>>();

  private errorFormatter: ErrorFormatter | undefined;
  setErrorFormatter(formatter: ErrorFormatter) {
    this.errorFormatter = formatter;
  }

  async request<K extends keyof T>(
    endpoint: K,
    ...rest: RequestOptions<T[K]> extends { request: any }
      ? [options: RequestOptions<T[K]>]
      : [options?: RequestOptions<T[K]>]
  ): Promise<SchemaInferOutput<T[K]['response']>> {
    const { abortSignal, definition, request } = this.validateRequest(
      endpoint,
      rest[0],
    );

    let resolverOutput: unknown;
    try {
      resolverOutput = await this.config.resolver({
        definition,
        endpoint,
        request: request as any,
        abortSignal,
      });
    } catch (e) {
      const error = this.errorFormatter
        ? this.errorFormatter(e as Error, { stage: 'resolver' })
        : e;
      this.$failed.publish({
        endpoint: endpoint,
        request: request as any,
        error: error as Error,
      });
      throw error;
    }

    const parsedResponse = this.validateResponse(
      endpoint,
      definition,
      resolverOutput,
    );

    this.$succeeded.publish({
      endpoint: endpoint,
      request: request as any,
      response: parsedResponse,
    });

    return parsedResponse;
  }

  private validateRequest<K extends keyof T>(
    endpoint: K,
    options: RequestOptions<T[K]> | undefined,
  ) {
    try {
      const definition = this.getEndpointDefinition(endpoint);
      const abortSignal = options?.abort;
      const unparsedRequestBody = options?.request;
      const request = definition.request?.parse(
        unparsedRequestBody,
      ) as SchemaInferInput<T[K]['request']>;

      return { definition, abortSignal, request };
    } catch (e) {
      const parsingError = new APIClientRequestParsingError({
        previousError: e as Error,
        endpoint: String(endpoint),
      });
      if (!this.errorFormatter) throw parsingError;
      throw this.errorFormatter(parsingError, { stage: 'request-validation' });
    }
  }

  private validateResponse<K extends keyof T>(
    endpoint: K,
    definition: T[K],
    resolverOutput: unknown,
  ): SchemaInferOutput<T[K]['response']> {
    try {
      const parsedResponse = definition.response?.parse(
        resolverOutput,
      ) as SchemaInferOutput<T[K]['response']>;
      return parsedResponse;
    } catch (e) {
      const parsingError = new APIClientResponseParsingError({
        previousError: e as Error,
        endpoint: String(endpoint),
      });
      if (!this.errorFormatter) throw parsingError;
      throw this.errorFormatter(parsingError, { stage: 'response-validation' });
    }
  }

  getEndpointDefinition<K extends keyof T>(endpoint: K): T[K] {
    const endpointDefinition = this.definitions[endpoint];
    if (!endpointDefinition) {
      throw new Error(`Endpoint ${String(endpoint)} not found`);
    }
    return endpointDefinition;
  }
}
