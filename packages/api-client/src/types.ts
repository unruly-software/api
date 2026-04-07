import type { AnyEndpointDefinition } from './endpoint';
import type { SchemaInferInput, SchemaInferOutput } from './schema';

export type APIResolver<T extends APIEndpointDefinitions> = (
  outbound: {
    [K in keyof T]: {
      endpoint: K;
      definition: T[K];
      request: SchemaInferOutput<T[K]['request']>;
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
