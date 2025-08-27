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

type QueryKeyItem = string | number | boolean | object | null | undefined;

export type QueryConfig<API extends APIEndpointDefinitions> = {
  [K in keyof API]: {
    queryKey?: (input: {
      request: SchemaInferInput<API[K]['request']> | null;
    }) => QueryKeyItem[];

    invalidates?: (input: {
      request: SchemaInferInput<API[K]['request']>;
      response: SchemaInferOutput<API[K]['response']>;
    }) => QueryKeyItem[][];

    errorInvalidates?: (input: {
      request: SchemaInferInput<API[K]['request']>;
      error: Error;
    }) => QueryKeyItem[][];

    updateCacheOnSuccess?: (input: {
      request: SchemaInferInput<API[K]['request']>;
      response: SchemaInferOutput<API[K]['response']>;
    }) => [[QueryKeyItem[], unknown]];

    queryOptions?: Omit<
      UseQueryOptions<
        SchemaInferOutput<API[K]['response']>,
        Error,
        SchemaInferOutput<API[K]['response']>,
        unknown[]
      >,
      'queryFn' | 'queryKey'
    >;

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
};

export type APIQueryOptions<DEF extends AnyEndpointDefinition> = {
  overrides?: Omit<
    UseQueryOptions<
      SchemaInferOutput<DEF['response']>,
      Error,
      SchemaInferOutput<DEF['response']>,
      unknown[]
    >,
    'queryFn' | 'queryKey'
  >;
} & (SchemaInferInput<DEF['request']> extends never
  ? { data?: SchemaInferInput<DEF['request']> | null }
  : { data: SchemaInferInput<DEF['request']> | null });

export type APIQueryHook<API extends APIEndpointDefinitions> = <
  ENDPOINT extends keyof API,
>(
  endpoint: ENDPOINT,
  ...rest: SchemaInferInput<API[ENDPOINT]['request']> extends never
    ? [options?: APIQueryOptions<API[ENDPOINT]>]
    : [options: APIQueryOptions<API[ENDPOINT]>]
) => UseQueryResult<SchemaInferOutput<API[ENDPOINT]['response']>, Error>;

export type APIMutationOptions<DEF extends AnyEndpointDefinition> = {
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

interface MountedQueries<API extends APIEndpointDefinitions> {
  useAPIQuery: APIQueryHook<API>;
  useAPIMutation: APIMutationHook<API>;
}

export const mountAPIQueryClient = <API extends APIEndpointDefinitions>(
  client: APIClient<API>,
  queryClient: QueryClient,
  globalConfig: QueryConfig<API>,
): MountedQueries<API> => {
  const getEndpointConfig = <K extends keyof API>(endpoint: K) => {
    return globalConfig[endpoint] || {};
  };

  const defaultQueryKey = <K extends keyof API>(
    endpoint: K,
    request: unknown,
  ) => {
    return [String(endpoint), request] as QueryKeyItem[];
  };

  client.$failed.subscribe(({ endpoint, error, request }) => {
    const keys = getEndpointConfig(endpoint)?.errorInvalidates?.({
      error,
      request,
    });
    if (keys?.length) {
      queryClient.invalidateQueries({ queryKey: keys });
    }
  });

  client.$succeeded.subscribe(({ endpoint, request, response }) => {
    const keys = getEndpointConfig(endpoint).invalidates?.({
      request,
      response,
    });
    if (keys?.length) {
      queryClient.invalidateQueries({ queryKey: keys });
    }
    const cacheUpdates = getEndpointConfig(endpoint).updateCacheOnSuccess?.({
      request,
      response,
    });
    if (cacheUpdates?.length) {
      for (const [key, value] of cacheUpdates) {
        queryClient.setQueryData(key, value);
      }
    }
  });

  const useAPIQuery: APIQueryHook<API> = (endpoint, ...rest) => {
    const options = rest[0];
    const conf = getEndpointConfig(endpoint);

    let queryKey: unknown[];
    if (conf.queryKey) {
      queryKey = conf.queryKey({
        request: options?.data ?? null,
      });
    } else {
      queryKey = defaultQueryKey(endpoint, options?.data ?? null);
    }

    return useQuery({
      queryKey,
      enabled:
        options?.data === null ? false : (options?.overrides?.enabled ?? true),
      queryFn: async ({ signal }) => {
        const response = await client.request(endpoint, {
          request: (options?.data ?? null) as any,
          abort: signal,
        });
        return response;
      },
      ...getEndpointConfig(endpoint).queryOptions,
      ...options?.overrides,
    });
  };

  const useAPIMutation: APIMutationHook<API> = (endpoint, options) => {
    return useMutation({
      mutationFn: async (input) => {
        const response = await client.request(endpoint, {
          request: input as any,
        });
        return response;
      },
      ...getEndpointConfig(endpoint).mutationOptions,
      ...(options?.overrides as any),
    });
  };

  return {
    useAPIQuery,
    useAPIMutation,
  };
};
