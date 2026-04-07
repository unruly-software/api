/** biome-ignore-all lint/style/useShorthandFunctionType: Leave as interface */
import {
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
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
  QueryKeyItem,
} from './defineAPIQueryKeys';

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
   * keys
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
  }) => readonly KEYS[];

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
  }) => readonly KEYS[];

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
 * The pair of hooks returned by `mountAPIQueryClient` — one for queries and
 * one for mutations, each typed against the bundle's api definition and the
 * strict-mode `KEYS` type parameter.
 */
export interface MountedQueries<
  API extends APIEndpointDefinitions,
  KEYS extends readonly QueryKeyItem[],
> {
  /** React-query `useQuery` wrapper. */
  useAPIQuery: APIQueryHook<API, KEYS>;

  /** React-query `useMutation` wrapper. */
  useAPIMutation: APIMutationHook<API>;
}

/**
 * Wire a `defineAPIQueryKeys` bundle and an `APIClient` to a TanStack
 * `QueryClient`. Returns the `useAPIQuery` and `useAPIMutation` hooks.
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

  const useAPIQuery: any = (endpoint: string, ...rest: any[]) => {
    const queryOptionsArg = rest[0];
    const conf = getEndpointConfig(endpoint as keyof API);

    return useQuery({
      queryKey: queryKeys.getKeyForEndpoint(
        endpoint as keyof API,
        queryOptionsArg?.data ?? undefined,
      ) as readonly unknown[],
      enabled:
        queryOptionsArg?.data === null
          ? false
          : (queryOptionsArg?.overrides?.enabled ?? true),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const response = await apiClient.request(endpoint as any, {
          request: (queryOptionsArg?.data ?? null) as any,
          abort: signal,
        });
        return response;
      },
      ...conf.queryOptions,
      ...queryOptionsArg?.overrides,
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
    useAPIMutation,
  };
};
