import { type BatchLoader, createBatchLoader } from './batchLoader';
import type { AnyEndpointDefinition, EndpointDefinition } from './endpoint';
import {
  APIClientError,
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
import { type AnyBatchConfig, isBatchedEndpoint } from './virtual';

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
      resolverOutput = isBatchedEndpoint(definition)
        ? await this.getBatchLoader(endpoint, definition.batch)(
            request,
            abortSignal,
          )
        : await this.config.resolver({
            definition,
            endpoint,
            request: request as any,
            abortSignal,
          });
    } catch (e) {
      // A batched call can fail validating the `via` request/response. Treat
      // that like the same failure on a real endpoint: no `$failed`.
      if (e instanceof APIClientRequestParsingError) {
        throw this.formatError(e, 'request-validation');
      }
      if (e instanceof APIClientResponseParsingError) {
        throw this.formatError(e, 'response-validation');
      }
      const error = this.formatError(e as Error, 'resolver');
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
    let definition: T[K];
    try {
      definition = this.getEndpointDefinition(endpoint);
    } catch (endpointError) {
      if (!this.errorFormatter) throw endpointError;
      throw this.errorFormatter(endpointError as Error, {
        stage: 'request-validation',
      });
    }
    try {
      const request = parseRequest(
        endpoint,
        definition,
        options?.request,
      ) as SchemaInferInput<T[K]['request']>;

      return { definition, abortSignal: options?.abort, request };
    } catch (parsingError) {
      if (!this.errorFormatter) throw parsingError;
      throw this.errorFormatter(parsingError as Error, {
        stage: 'request-validation',
      });
    }
  }

  private validateResponse<K extends keyof T>(
    endpoint: K,
    definition: T[K],
    resolverOutput: unknown,
  ): SchemaInferOutput<T[K]['response']> {
    try {
      return parseResponse(
        endpoint,
        definition,
        resolverOutput,
      ) as SchemaInferOutput<T[K]['response']>;
    } catch (parsingError) {
      if (!this.errorFormatter) throw parsingError;
      throw this.errorFormatter(parsingError as Error, {
        stage: 'response-validation',
      });
    }
  }

  private formatError(
    error: Error,
    stage: Parameters<ErrorFormatter>[1]['stage'],
  ) {
    return this.errorFormatter ? this.errorFormatter(error, { stage }) : error;
  }

  private batchLoaders = new Map<keyof T, BatchLoader<unknown, unknown>>();

  /**
   * One loader per virtual endpoint, created on first use. The combined
   * request is validated against the `via` endpoint's schemas but publishes
   * no topic events and skips the error formatter — each single-item caller
   * gets those in `request`.
   */
  private getBatchLoader(endpoint: keyof T, batch: AnyBatchConfig) {
    let loader = this.batchLoaders.get(endpoint);
    if (loader) return loader;

    const { via, toRequest, fromResponse, key, windowMs, maxBatchSize } = batch;
    loader = createBatchLoader<unknown, unknown>({
      key,
      windowMs,
      maxBatchSize,
      load: async (requests, signal) => {
        const definition = this.getEndpointDefinition(via);
        const request = parseRequest(via, definition, toRequest(requests));
        const output = await this.config.resolver({
          endpoint: via,
          definition,
          request,
          abortSignal: signal,
        } as any);
        const response = parseResponse(via, definition, output);
        const expectsItem = this.definitions[endpoint].response !== null;
        return (item) => {
          const picked = fromResponse(response, item);
          if (picked === undefined && expectsItem) {
            throw new APIClientError(
              `Batch response from "${via}" did not include an item for "${String(endpoint)}"`,
            );
          }
          return picked;
        };
      },
    });
    this.batchLoaders.set(endpoint, loader);
    return loader;
  }

  getEndpointDefinition<K extends keyof T>(endpoint: K): T[K] {
    const endpointDefinition = this.definitions[endpoint];
    if (!endpointDefinition) {
      throw new APIClientError(`Endpoint ${String(endpoint)} not found`);
    }
    return endpointDefinition;
  }
}

const parseRequest = (
  endpoint: PropertyKey,
  definition: AnyEndpointDefinition,
  body: unknown,
) => {
  try {
    return definition.request?.parse(body);
  } catch (e) {
    throw new APIClientRequestParsingError({
      previousError: e as Error,
      endpoint: String(endpoint),
    });
  }
};

const parseResponse = (
  endpoint: PropertyKey,
  definition: AnyEndpointDefinition,
  output: unknown,
) => {
  try {
    return definition.response?.parse(output);
  } catch (e) {
    throw new APIClientResponseParsingError({
      previousError: e as Error,
      endpoint: String(endpoint),
    });
  }
};
