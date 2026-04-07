/** biome-ignore-all lint/style/useShorthandFunctionType: Leave as interface */
import type {
  APIEndpointDefinitions,
  SchemaInferInput,
} from '@unruly-software/api-client';

export type QueryKeyItem =
  | string
  | number
  | boolean
  | object
  | null
  | undefined;

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type QueryKeyResolverFor<
  API extends APIEndpointDefinitions,
  K extends keyof API,
> = (
  request: SchemaInferInput<API[K]['request']> | undefined,
) => readonly QueryKeyItem[];

export type QueryKeysMap<API extends APIEndpointDefinitions> = {
  [K in keyof API]?: QueryKeyResolverFor<API, K>;
};

type ResolvedQueryKeyFor<
  API extends APIEndpointDefinitions,
  QUERY_KEYS,
  K extends keyof API,
> = K extends keyof QUERY_KEYS
  ? QUERY_KEYS[K] extends (...args: any[]) => infer R
    ? R extends readonly unknown[]
      ? Mutable<R>
      : never
    : [K & string, SchemaInferInput<API[K]['request']> | undefined]
  : [K & string, SchemaInferInput<API[K]['request']> | undefined];

/** Prefixes<['a', 1, true]> = ['a'] | ['a', 1] | ['a', 1, true] */
type Prefixes<T extends readonly any[]> = T extends readonly [
  ...infer Init,
  any,
]
  ? T | Prefixes<Init>
  : never;

/** First element of a tuple */
type FirstOf<T> = T extends readonly [infer First, ...unknown[]]
  ? First
  : never;

/** Tail elements of a tuple after a known first element */
type RestOf<T, FIRST> = T extends readonly [FIRST, ...infer Rest]
  ? Readonly<Rest>
  : never;

type AllQueryKeysForRaw<API extends APIEndpointDefinitions, QUERY_KEYS> = {
  [K in keyof API]: ResolvedQueryKeyFor<API, QUERY_KEYS, K> extends infer QK
    ? QK extends readonly unknown[]
      ? Prefixes<QK>
      : never
    : never;
}[keyof API];

/**
 * The union of every possible query key the bundle can produce. Pass the type
 * of the value returned by `defineAPIQueryKeys`.
 *
 * @example
 *   const queryKeys = defineAPIQueryKeys(api, { ... });
 *   type AllKeys = QueryKeysFor<typeof queryKeys>;
 */
export type QueryKeysFor<DEF> = DEF extends APIQueryConfigDefinition<
  infer API,
  infer QUERY_KEYS
>
  ? { [K in keyof API]: ResolvedQueryKeyFor<API, QUERY_KEYS, K> }[keyof API]
  : never;

/**
 * The resolved query key shape for a single endpoint name on the bundle.
 */
export type QueryKeyForEndpoint<DEF, K> = DEF extends APIQueryConfigDefinition<
  infer API,
  infer QUERY_KEYS
>
  ? K extends keyof API
    ? ResolvedQueryKeyFor<API, QUERY_KEYS, K>
    : never
  : never;

/**
 * The union of all query key prefixes the queryKeys bundle can produce — what
 * `bundle.getKey(...)` accepts so callers can use partial keys for
 * hierarchical invalidation.
 */
export type AllQueryKeysFor<DEF> = DEF extends APIQueryConfigDefinition<
  infer API,
  infer QUERY_KEYS
>
  ? AllQueryKeysForRaw<API, QUERY_KEYS>
  : never;

/**
 * The bundle returned by `defineAPIQueryKeys`. Holds the api definition, the
 * raw queryKeys map the user passed in, and the resolver helpers used by
 * `mountAPIQueryClient` and by user code that builds keys for invalidation.
 */
export interface APIQueryConfigDefinition<
  API extends APIEndpointDefinitions,
  QUERY_KEYS,
> {
  /** The api definition the bundle was built against. Same reference that was
   *  passed as the first argument to `defineAPIQueryKeys`. */
  api: API;

  queryKeys: QUERY_KEYS;

  /**
   * Build a query key prefix that can be passed directly to
   * `queryClient.invalidateQueries`.
   *
   * @example
   *   queryClient.invalidateQueries({ queryKey: queryKeys.getKey('users') });
   *   queryClient.invalidateQueries({ queryKey: queryKeys.getKey('users', 5) });
   */
  getKey: <
    const FIRST extends FirstOf<AllQueryKeysForRaw<API, QUERY_KEYS>>,
    const REST extends RestOf<AllQueryKeysForRaw<API, QUERY_KEYS>, FIRST>,
  >(
    first: FIRST,
    ...rest: REST
  ) => readonly [FIRST, ...REST];

  /**
   * Resolve the cache key for a single endpoint. If a resolver is registered
   * in the queryKeys map, it's called with the request and its return value
   * is used. Otherwise the default `[endpointName, request | undefined]`
   * shape is returned.
   *
   * @example
   *   mountAPIQueryClient({
   *     ...,
   *     endpoints: {
   *       updateUser: {
   *         invalidates: ({ response }) => [
   *           queryKeys.getKeyForEndpoint('getUser', { userId: response.id }),
   *         ],
   *       },
   *     },
   *   });
   */
  getKeyForEndpoint: <K extends keyof API>(
    endpoint: K,
    request?: SchemaInferInput<API[K]['request']>,
  ) => ResolvedQueryKeyFor<API, QUERY_KEYS, K>;
}

type NoExtraQueryKeys<API, QUERY_KEYS> = {
  [K in keyof QUERY_KEYS as K extends keyof API ? never : K]: never;
};

/**
 * @example
 *   defineAPIQueryKeys(api, {
 *     getUser: (req) => queryKey('users', req.userId),
 *   });
 */
export const queryKey = <const T extends readonly QueryKeyItem[]>(
  ...key: T
): T => key;

const makeQueryKeyResolver = <
  API extends APIEndpointDefinitions,
  QUERY_KEYS extends QueryKeysMap<API>,
>(
  _api: API,
  queryKeys: QUERY_KEYS,
) => {
  const getKey = <T extends readonly unknown[]>(...keys: T): T => keys;

  const getKeyForEndpoint = (endpoint: string, request: unknown) => {
    const resolver = (
      queryKeys as Record<string, QueryKeyResolverFor<API, any>>
    )[endpoint];
    if (resolver) return resolver(request as any);
    return [endpoint, request];
  };

  return { getKey, getKeyForEndpoint };
};

/**
 * Define the query-key registry for an API. The second parameter IS the
 * queryKeys map directly: a record of endpoint name → resolver function.
 *
 * @example
 *   const queryKeys = defineAPIQueryKeys(api, {
 *     getUser:     (req) => queryKey('users', req.userId),
 *     searchPosts: (req) => queryKey('posts', 'search', req.query),
 *   });
 */
export const defineAPIQueryKeys = <
  API extends APIEndpointDefinitions,
  const QUERY_KEYS extends QueryKeysMap<API>,
>(
  api: API,
  queryKeys: QUERY_KEYS & NoExtraQueryKeys<API, QUERY_KEYS>,
): APIQueryConfigDefinition<API, QUERY_KEYS> => {
  const resolver = makeQueryKeyResolver(api, queryKeys as QueryKeysMap<API>);

  return {
    api,
    queryKeys,
    getKey: resolver.getKey as APIQueryConfigDefinition<
      API,
      QUERY_KEYS
    >['getKey'],
    getKeyForEndpoint: resolver.getKeyForEndpoint as APIQueryConfigDefinition<
      API,
      QUERY_KEYS
    >['getKeyForEndpoint'],
  };
};
