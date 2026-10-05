/** biome-ignore-all lint/style/useShorthandFunctionType: Leave as interface */
import {
  type GetNextPageParamFunction,
  type GetPreviousPageParamFunction,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import type {
  AnyEndpointDefinition,
  APIClient,
  APIEndpointDefinitions,
  SchemaInferInput,
  SchemaInferOutput,
} from '@unruly-software/api-client';
import type {
  APIQueryConfigDefinition,
  Prefixes,
  QueryKeyItem,
} from './defineAPIQueryKeys';

/**
 * Expand a `KEYS` union into the set of tuples accepted by `invalidates` /
 * `errorInvalidates`. For each tuple member of `KEYS`, every non-empty prefix
 * is allowed; wide array members (e.g. the default `readonly QueryKeyItem[]`
 * for free-form mode) pass through unchanged.
 *
 * The `[Prefixes<KEYS>] extends [never]` wrap prevents the conditional from
 * distributing over `never`, which would otherwise erase wide-array members
 * whose prefix expansion is `never`.
 *
 * Each prefix tuple is wrapped in `Readonly<>` so that the values returned by
 * `bundle.getKey(...)` (which are `readonly` thanks to the `<const>` modifier
 * on its generics) match the constraint without needing call-site casts.
 */
type InvalidationKeys<KEYS> = KEYS extends readonly QueryKeyItem[]
  ? [Prefixes<KEYS>] extends [never]
    ? KEYS
    : Readonly<Prefixes<KEYS>>
  : never;

export type EndpointConfig<
  API extends APIEndpointDefinitions,
  K extends keyof API,
  KEYS extends readonly QueryKeyItem[] = readonly QueryKeyItem[],
> = {
  /**
   * Called after a successful request to this endpoint. Receives the request
   * payload and the parsed response, and returns a list of cache keys to
   * invalidate.
   *
   * In strict mode the return type is checked against the union of registered
   * keys (and any custom keys the caller unioned in). Prefixes of any
   * registered tuple are also accepted, so `queryKeys.getKey('users')` is a
   * valid invalidation key alongside the full
   * `queryKeys.getKeyForEndpoint('getUser', { userId: 5 })`.
   *
   * @example
   *   updateUser: {
   *     invalidates: ({ request, response }) => [
   *       queryKeys.getKeyForEndpoint('getUser', { userId: response.id }),
   *       queryKeys.getKey('users'),
   *     ],
   *   }
   */
  invalidates?: (input: {
    request: SchemaInferInput<API[K]['request']>;
    response: SchemaInferOutput<API[K]['response']>;
  }) => readonly InvalidationKeys<KEYS>[];

  /**
   * Called after a failed request to this endpoint. Receives the request
   * payload and the thrown error.
   * @example
   *   updateUser: {
   *     errorInvalidates: ({ request }) => [
   *       queryKeys.getKeyForEndpoint('getUser', { userId: request.userId }),
   *     ],
   *   }
   */
  errorInvalidates?: (input: {
    request: SchemaInferInput<API[K]['request']>;
    error: Error;
  }) => readonly InvalidationKeys<KEYS>[];

  /**
   * Default react-query options applied to every `useAPIQuery` call against
   * this endpoint. Merged with — and overridden by — any per-call
   * `overrides` passed at the hook site.
   *
   * @example
   *   getUser: {
   *     queryOptions: { staleTime: 60_000, gcTime: 5 * 60_000 },
   *   }
   */
  queryOptions?: Omit<
    UseQueryOptions<
      SchemaInferOutput<API[K]['response']>,
      Error,
      SchemaInferOutput<API[K]['response']>,
      KEYS
    >,
    'queryFn' | 'queryKey'
  >;

  /**
   * Default react-query options applied to every `useAPIMutation` call
   * against this endpoint. Merged with — and overridden by — any per-call
   * `overrides`.
   *
   * @example
   *   createUser: {
   *     mutationOptions: {
   *       retry: 2,
   *       onError: (err) => toast.error(err.message),
   *     },
   *   }
   */
  mutationOptions?: Omit<
    UseMutationOptions<
      SchemaInferOutput<API[K]['response']> extends never
        ? void
        : SchemaInferOutput<API[K]['response']>,
      Error,
      SchemaInferInput<API[K]['request']> extends never
        ? undefined
        : SchemaInferInput<API[K]['request']>
    >,
    'mutationFn'
  >;
};

/**
 * The single args object passed to `mountAPIQueryClient`. Bundles the api
 * client, the react-query `QueryClient`, the `defineAPIQueryKeys` bundle and
 * an optional per-endpoint behavior map into one configuration block.
 *
 * @example
 *   mountAPIQueryClient({
 *     apiClient,
 *     queryClient,
 *     queryKeys,
 *     endpoints: {
 *       updateUser: {
 *         invalidates: ({ response }) => [
 *           queryKeys.getKeyForEndpoint('getUser', { userId: response.id }),
 *         ],
 *       },
 *     },
 *   });
 */
export type MountAPIQueryClientArgs<
  API extends APIEndpointDefinitions,
  KEYS extends readonly QueryKeyItem[] = readonly QueryKeyItem[],
> = {
  /** The `APIClient` instance built around the api definition. Provides the
   *  resolver and the `$succeeded` / `$failed` event topics that drive
   *  cache invalidation. */
  apiClient: APIClient<API>;

  /** The react-query `QueryClient` to wire the hooks against. */
  queryClient: QueryClient;

  /** The bundle returned by `defineAPIQueryKeys`. Used to build query keys
   *  for the hooks and to resolve invalidation keys.
   **/
  queryKeys: APIQueryConfigDefinition<API, any>;

  /**
   * Optional per-endpoint behavior map. Keys are endpoint names from the
   * api definition; values are `EndpointConfig` blocks describing how cache
   * invalidation, query options and mutation options should behave for that
   * endpoint.
   *
   * @example
   *   endpoints: {
   *     updateUser: {
   *       invalidates: ({ response }) => [
   *         queryKeys.getKeyForEndpoint('getUser', { userId: response.id }),
   *       ],
   *     },
   *     getUser: {
   *       queryOptions: { staleTime: 60_000 },
   *     },
   *   }
   */
  endpoints?: {
    [K in keyof API]?: EndpointConfig<API, K, KEYS>;
  };
};

export type MountAPIQueryClientOptions<
  API extends APIEndpointDefinitions,
  KEYS extends readonly QueryKeyItem[] = readonly QueryKeyItem[],
> = Pick<MountAPIQueryClientArgs<API, KEYS>, 'endpoints'>;

/**
 * Options object passed to `useAPIQuery`. Always carries the request payload
 * (or `null` to disable the query) under `data`, and optionally `overrides`
 * for any react-query option that isn't `queryFn` or `queryKey` (those are
 * owned by the bundle).
 *
 * Endpoints whose request type is `never` (i.e. `request: null` in the
 * definition) make `data` optional; everything else requires it.
 *
 * @example
 *   useAPIQuery('getUser', {
 *     data: { userId: 1 },
 *     overrides: { staleTime: 60_000 },
 *   });
 *
 *   // Disable a query while waiting on prerequisites:
 *   useAPIQuery('getUser', { data: needsId ? null : { userId } });
 */
export type APIQueryOptions<
  DEF extends AnyEndpointDefinition,
  KEYS extends readonly QueryKeyItem[] = readonly QueryKeyItem[],
> = {
  /**
   * Per-call react-query overrides. Merged on top of any
   * `endpoints[K].queryOptions` from the mount config.
   **/
  overrides?: Omit<
    UseQueryOptions<
      SchemaInferOutput<DEF['response']>,
      Error,
      SchemaInferOutput<DEF['response']>,
      KEYS
    >,
    'queryFn' | 'queryKey'
  >;
} & (SchemaInferInput<DEF['request']> extends never
  ? { data?: SchemaInferInput<DEF['request']> | null }
  : { data: SchemaInferInput<DEF['request']> | null });

/**
 * The signature of the `useAPIQuery` hook returned by `mountAPIQueryClient`.
 * Generic over the api definition and the strict-mode `KEYS` type parameter.
 *
 * Endpoints whose request type is `never` take an optional options argument;
 * everything else requires `data`.
 *
 * @example
 *   const { useAPIQuery } = mountAPIQueryClient({ ... });
 *   const { data, error, isLoading } = useAPIQuery('getUser', {
 *     data: { userId: 1 },
 *   });
 */
export type APIQueryHook<
  API extends APIEndpointDefinitions,
  KEYS extends readonly QueryKeyItem[],
> = <ENDPOINT extends keyof API>(
  endpoint: ENDPOINT,
  ...rest: SchemaInferInput<API[ENDPOINT]['request']> extends never
    ? [options?: APIQueryOptions<API[ENDPOINT], KEYS>]
    : [options: APIQueryOptions<API[ENDPOINT], KEYS>]
) => UseQueryResult<SchemaInferOutput<API[ENDPOINT]['response']>, Error>;

/**
 * Options object passed to `useAPIInfiniteQuery`. `data` is the base request
 * (or `null` to disable the query); `withPageParam` merges the current page
 * param into it to build the request sent for each page.
 *
 * Endpoint-level `queryOptions` from the mount config are not applied —
 * they're typed for `useQuery`, not `useInfiniteQuery`.
 *
 * @example
 *   useAPIInfiniteQuery('searchPosts', {
 *     data: { query: 'react' },
 *     initialPageParam: 1,
 *     withPageParam: (data, page) => ({ ...data, page }),
 *     getNextPageParam: (last) => last.nextPage ?? undefined,
 *   });
 */
export type APIInfiniteQueryOptions<
  DEF extends AnyEndpointDefinition,
  TPageParam,
> = {
  data: SchemaInferInput<DEF['request']> | null;
  initialPageParam: TPageParam;
  /** Build the request for a page from the base `data` and its page param. */
  withPageParam: (
    data: SchemaInferInput<DEF['request']>,
    pageParam: TPageParam,
  ) => SchemaInferInput<DEF['request']>;
  /** Return the next page param, or `undefined`/`null` when there are no more pages. */
  getNextPageParam: GetNextPageParamFunction<
    TPageParam,
    SchemaInferOutput<DEF['response']>
  >;
  getPreviousPageParam?: GetPreviousPageParamFunction<
    TPageParam,
    SchemaInferOutput<DEF['response']>
  >;
  /** Per-call react-query overrides. */
  overrides?: Omit<
    UseInfiniteQueryOptions<
      SchemaInferOutput<DEF['response']>,
      Error,
      InfiniteData<SchemaInferOutput<DEF['response']>, TPageParam>,
      QueryKey,
      TPageParam
    >,
    | 'queryFn'
    | 'queryKey'
    | 'initialPageParam'
    | 'getNextPageParam'
    | 'getPreviousPageParam'
  >;
};

/**
 * The signature of the `useAPIInfiniteQuery` hook returned by
 * `mountAPIQueryClient`. Its cache key is the endpoint's resolved key for
 * `data` with `'$infinite'` appended, so prefix invalidations registered for
 * the endpoint also refetch it.
 *
 * @example
 *   const { useAPIInfiniteQuery } = mountAPIQueryClient({ ... });
 *   const posts = useAPIInfiniteQuery('searchPosts', { ... });
 *   posts.data?.pages.flatMap((page) => page.posts);
 *   posts.fetchNextPage();
 */
export type APIInfiniteQueryHook<API extends APIEndpointDefinitions> = <
  ENDPOINT extends keyof API,
  TPageParam,
>(
  endpoint: ENDPOINT,
  options: APIInfiniteQueryOptions<API[ENDPOINT], TPageParam>,
) => UseInfiniteQueryResult<
  InfiniteData<SchemaInferOutput<API[ENDPOINT]['response']>, TPageParam>,
  Error
>;

/**
 * Options object passed to `useAPIMutation`. Carries `overrides` for any
 * react-query mutation option except `mutationFn` (owned by the bundle).
 *
 * @example
 *   useAPIMutation('createUser', {
 *     overrides: {
 *       onSuccess: (user) => toast(`Welcome, ${user.name}`),
 *       onError:   (err)  => toast.error(err.message),
 *     },
 *   });
 */
export type APIMutationOptions<DEF extends AnyEndpointDefinition> = {
  /**
   * Per-call react-query mutation overrides. Merged on top of any
   * `endpoints[K].mutationOptions` from the mount config. `mutationFn` is
   * excluded — it's owned by the bundle.
   */
  overrides?: Omit<
    UseMutationOptions<
      SchemaInferOutput<DEF['response']> extends never
        ? void
        : SchemaInferOutput<DEF['response']>,
      Error,
      SchemaInferInput<DEF['request']> extends never
        ? undefined
        : SchemaInferInput<DEF['request']>
    >,
    'mutationFn'
  >;
};

/**
 * The signature of the `useAPIMutation` hook returned by
 * `mountAPIQueryClient`. Generic over the api definition; the mutation's
 * variables type is the endpoint's request payload, and the result type is
 * the endpoint's response.
 *
 * @example
 *   const { useAPIMutation } = mountAPIQueryClient({ ... });
 *   const updateUser = useAPIMutation('updateUser');
 *   updateUser.mutate({ userId: 1, name: 'New name' });
 */
export type APIMutationHook<API extends APIEndpointDefinitions> = <
  ENDPOINT extends keyof API,
>(
  endpoint: ENDPOINT,
  options?: APIMutationOptions<API[ENDPOINT]>,
) => UseMutationResult<
  SchemaInferOutput<API[ENDPOINT]['response']> extends never
    ? void
    : SchemaInferOutput<API[ENDPOINT]['response']>,
  Error,
  SchemaInferInput<API[ENDPOINT]['request']> extends never
    ? undefined
    : SchemaInferInput<API[ENDPOINT]['request']>
>;

/**
 * The hooks returned by `mountAPIQueryClient` — queries, infinite queries and
 * mutations, each typed against the bundle's api definition and the
 * strict-mode `KEYS` type parameter.
 */
export interface MountedQueries<
  API extends APIEndpointDefinitions,
  KEYS extends readonly QueryKeyItem[],
> {
  /** React-query `useQuery` wrapper. */
  useAPIQuery: APIQueryHook<API, KEYS>;

  /** React-query `useInfiniteQuery` wrapper. */
  useAPIInfiniteQuery: APIInfiniteQueryHook<API>;

  /** React-query `useMutation` wrapper. */
  useAPIMutation: APIMutationHook<API>;
}

/**
 * Wire a `defineAPIQueryKeys` bundle and an `APIClient` to a TanStack
 * `QueryClient`. Returns the `useAPIQuery`, `useAPIInfiniteQuery` and
 * `useAPIMutation` hooks.
 *
 * ```ts
 * const queryKeys = defineAPIQueryKeys(api, { ... });
 *
 * const { useAPIQuery, useAPIMutation } = mountAPIQueryClient({
 *   apiClient,
 *   queryClient,
 *   queryKeys,
 *   endpoints: {
 *     updateUser: {
 *       invalidates: ({ response }) => [
 *         queryKeys.getKeyForEndpoint('getUser', { userId: response.id }),
 *       ],
 *     },
 *   },
 * });
 * ```
 * Free-form query key mode is the default. To opt into strict typing for query
 * keys, pass `<typeof api, QueryKeysFor<typeof queryKeys>>` as type
 * parameters.
 */
export const mountAPIQueryClient = <
  API extends APIEndpointDefinitions,
  KEYS extends readonly QueryKeyItem[] = readonly QueryKeyItem[],
>(
  args: MountAPIQueryClientArgs<API, KEYS>,
): MountedQueries<API, KEYS> => {
  const { apiClient, queryClient, queryKeys, endpoints } = args;

  const getEndpointConfig = <K extends keyof API>(
    endpoint: K,
  ): EndpointConfig<API, K, KEYS> =>
    (endpoints?.[endpoint] ?? {}) as EndpointConfig<API, K, KEYS>;

  apiClient.$failed.subscribe(({ endpoint, error, request }) => {
    const keys = getEndpointConfig(endpoint).errorInvalidates?.({
      error,
      request,
    });
    if (keys?.length) {
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: key as readonly unknown[] });
      }
    }
  });

  apiClient.$succeeded.subscribe(({ endpoint, request, response }) => {
    const keys = getEndpointConfig(endpoint).invalidates?.({
      request,
      response,
    });
    if (keys?.length) {
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: key as readonly unknown[] });
      }
    }
  });

  const resolveKey = (endpoint: string, data: unknown) =>
    queryKeys.getKeyForEndpoint(
      endpoint as keyof API,
      (data ?? undefined) as any,
    ) as readonly unknown[];

  const isEnabled = (data: unknown, overrides?: { enabled?: unknown }) =>
    data !== null && (overrides?.enabled ?? true);

  const request = (endpoint: string, data: unknown, signal: AbortSignal) =>
    apiClient.request(endpoint as any, { request: data as any, abort: signal });

  const useAPIQuery: any = (endpoint: string, ...rest: any[]) => {
    const queryOptionsArg = rest[0];
    const conf = getEndpointConfig(endpoint as keyof API);

    return useQuery({
      queryKey: resolveKey(endpoint, queryOptionsArg?.data),
      enabled: isEnabled(queryOptionsArg?.data, queryOptionsArg?.overrides),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        request(endpoint, queryOptionsArg?.data ?? null, signal),
      ...conf.queryOptions,
      ...queryOptionsArg?.overrides,
    } as any);
  };

  const useAPIInfiniteQuery: any = (
    endpoint: string,
    options: APIInfiniteQueryOptions<AnyEndpointDefinition, unknown>,
  ) => {
    const { data, withPageParam, overrides, ...pageParamOptions } = options;

    return useInfiniteQuery({
      queryKey: [...resolveKey(endpoint, data), '$infinite'],
      queryFn: ({ pageParam, signal }: any) =>
        request(endpoint, withPageParam(data, pageParam), signal),
      ...pageParamOptions,
      ...overrides,
      enabled: isEnabled(data, overrides),
    } as any);
  };

  const useAPIMutation: APIMutationHook<API> = (endpoint, mutationOpts) => {
    const conf = getEndpointConfig(endpoint);
    return useMutation({
      mutationFn: async (input) => {
        const response = await apiClient.request(endpoint, {
          request: input as any,
        });
        return response;
      },
      ...conf.mutationOptions,
      ...(mutationOpts?.overrides as any),
    });
  };

  return {
    useAPIQuery,
    useAPIInfiniteQuery,
    useAPIMutation,
  };
};
