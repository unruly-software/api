import type { AnyEndpointDefinition } from './endpoint';
import type { SchemaInferInput, SchemaInferOutput } from './schema';
import { type ErrorMessage, makeTopic, type SuccessMessage } from './topic';

export type APIResolver<T extends APIEndpointDefinitions> = (
  outbound: {
    [K in keyof T]: {
      endpoint: K;
      definition: T[K];
      request: SchemaInferInput<T[K]['request']>;
      abortSignal?: AbortSignal;
    };
  }[keyof T],
) => Promise<unknown>;

export type APIEndpointDefinitions = Record<string, AnyEndpointDefinition>;

export type APIClientConfig<T extends APIEndpointDefinitions> = {
  resolver: APIResolver<T>;
};

export type RequestOptions<T extends AnyEndpointDefinition> = {
  abort?: AbortSignal;
} & (SchemaInferInput<T['request']> extends never
  ? {
      request?: SchemaInferInput<T['request']>;
    }
  : {
      request: SchemaInferInput<T['request']>;
    });

export type ErrorFormatter = (
  error: Error,
  context: {
    stage: 'request-validation' | 'resolver' | 'response-validation';
  },
) => Error;

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

  private beforeRequest<K extends keyof T>(
    endpoint: K,
    options: RequestOptions<T[K]> | undefined,
  ) {
    try {
      const definition = this.getEndpointDefinition(endpoint);
      const abortSignal = options?.abort;
      const unparsedRequestBody = options?.request;
      const request = definition.request?.parse(
        unparsedRequestBody,
      ) as SchemaInferInput<AnyEndpointDefinition['request']>;
      return { definition, abortSignal, request };
    } catch (e) {
      if (!this.errorFormatter) throw e;
      throw this.errorFormatter(e as Error, { stage: 'request-validation' });
    }
  }

  async request<K extends keyof T>(
    endpoint: K,
    ...rest: SchemaInferInput<T[K]['request']> extends never
      ? [options?: RequestOptions<T[K]>]
      : [options: RequestOptions<T[K]>]
  ): Promise<SchemaInferOutput<T[K]['response']>> {
    const { abortSignal, definition, request } = this.beforeRequest(
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

    let parsedResponse: SchemaInferOutput<T[K]['response']>;
    try {
      parsedResponse = definition.response?.parse(
        resolverOutput,
      ) as SchemaInferOutput<T[K]['response']>;
    } catch (e) {
      if (!this.errorFormatter) throw e;
      throw this.errorFormatter(e as Error, { stage: 'response-validation' });
    }

    this.$succeeded.publish({
      endpoint: endpoint,
      request: request as any,
      response: parsedResponse,
    });

    return parsedResponse;
  }

  private getEndpointDefinition<K extends keyof T>(endpoint: K) {
    const endpointDefinition = this.definitions[endpoint];
    if (!endpointDefinition) {
      throw new Error(`Endpoint ${String(endpoint)} not found`);
    }
    return endpointDefinition;
  }
}
