import type {
  SchemaInferInput,
  SchemaInferOutput,
  SchemaValue,
} from './schema';

type QueryKeyItem = string | number | boolean | object | null | undefined;

export type APIQueryConfig<
  REQUEST extends SchemaValue,
  _RESPONSE extends SchemaValue,
> = {
  queryKey?: (
    request: SchemaInferInput<REQUEST> | undefined,
  ) => QueryKeyItem[] | readonly QueryKeyItem[];
};

export type EndpointInput<T extends AnyEndpointDefinition> =
  T extends EndpointDefinition<infer REQUEST, any, any, any>
    ? SchemaInferInput<REQUEST>
    : never;

export type EndpointOutput<T extends AnyEndpointDefinition> =
  T extends EndpointDefinition<any, infer RESPONSE, any, any>
    ? SchemaInferOutput<RESPONSE>
    : never;

export type EndpointDefinition<
  REQUEST extends SchemaValue,
  RESPONSE extends SchemaValue,
  METADATA extends Record<string, unknown>,
  APIQUERY extends APIQueryConfig<REQUEST, RESPONSE> = APIQueryConfig<
    REQUEST,
    RESPONSE
  >,
> = {
  request: REQUEST;
  response: RESPONSE;
  metadata: METADATA;
  apiQuery?: APIQUERY;
};

export type AnyEndpointDefinition = EndpointDefinition<
  SchemaValue,
  SchemaValue,
  Record<string, unknown>,
  APIQueryConfig<any, any>
>;

export const defineAPI = <METADATA extends Record<string, unknown>>() => {
  return {
    defineEndpoint: <
      REQUEST extends SchemaValue,
      RESPONSE extends SchemaValue,
      APIQUERY extends APIQueryConfig<REQUEST, RESPONSE> = APIQueryConfig<
        REQUEST,
        RESPONSE
      >,
    >(
      definition: EndpointDefinition<REQUEST, RESPONSE, METADATA, APIQUERY>,
    ) => definition,
  };
};

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

type ExtractQueryKeyFromEndpoint<KK, T> = T extends {
  apiQuery?: infer APIQUERY;
}
  ? APIQUERY extends {
      queryKey: (...args: any[]) => infer KEY;
    }
    ? KEY extends readonly unknown[]
      ? Mutable<KEY>
      : never
    : T extends EndpointDefinition<infer REQUEST, any, any, any>
      ? [KK, SchemaInferInput<REQUEST> | undefined]
      : never
  : T extends EndpointDefinition<infer REQUEST, any, any, any>
    ? [KK, SchemaInferInput<REQUEST> | undefined]
    : never;

export type QueryKeysFor<T extends Record<string, any>> = {
  [K in keyof T]: ExtractQueryKeyFromEndpoint<K, T[K]>;
}[keyof T];

export type PartialQueryKeysFor<T extends Record<string, any>> = {
  [K in keyof T]: ExtractQueryKeyFromEndpoint<K, T[K]> extends infer QK
    ? QK extends readonly unknown[]
      ? Partial<QK>
      : never
    : never;
}[keyof T];

type Prefixes<T extends readonly any[]> = T extends readonly [
  ...infer Init,
  any,
]
  ? T | Prefixes<Init>
  : never;

export type AllQueryKeysFor<T extends Record<string, any>> = {
  [K in keyof T]: ExtractQueryKeyFromEndpoint<K, T[K]> extends infer QK
    ? QK extends readonly unknown[]
      ? Prefixes<QK>
      : never
    : never;
}[keyof T];

export type QueryKeyForEndpoint<
  NAME extends string,
  T extends AnyEndpointDefinition,
> = ExtractQueryKeyFromEndpoint<NAME, T>;
