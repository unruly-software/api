import type { APIEndpointDefinitions } from './APIClient';
import type { SchemaInferInput, SchemaInferOutput } from './schema';

export type ErrorMessage<T extends APIEndpointDefinitions> = {
  [K in keyof T]: {
    endpoint: K;
    request: SchemaInferInput<T[K]['request']>;
    error: Error;
  };
}[keyof T];

export type SuccessMessage<T extends APIEndpointDefinitions> = {
  [K in keyof T]: {
    endpoint: K;
    request: SchemaInferInput<T[K]['request']>;
    response: SchemaInferOutput<T[K]['response']>;
  };
}[keyof T];

export const makeTopic = <MESSAGE>() => {
  type Listener = (message: MESSAGE) => unknown;
  const listeners = new Set<Listener>();
  return {
    publish: (message: MESSAGE) => {
      listeners.forEach((listener) => {
        listener(message);
      });
    },
    publishAsync: async (message: MESSAGE) => {
      await Promise.all(
        Array.from(listeners).map(async (listener) => listener(message)),
      );
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
