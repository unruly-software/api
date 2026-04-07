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
  AllQueryKeysFor,
  AnyEndpointDefinition,
  APIClient,
  APIEndpointDefinitions,
  QueryKeyForEndpoint,
  QueryKeysFor,
  SchemaInferInput,
  SchemaInferOutput,
} from '@unruly-software/api-client';

type QueryKeyItem = string | number | boolean | object | null | undefined;

export interface QueryKeyResolver<API extends APIEndpointDefinitions> {
  <T extends AllQueryKeysFor<API>>(keys: T): QueryKeysFor<API>;
  forEndpoint: <K extends keyof API>(
    endpoint: K,
    request?: SchemaInferInput<API[K]['request']>,
  ) => QueryKeyForEndpoint<OnlyString<K>, API[K]>;
}

export const makeQueryKeyResolver = <API extends APIEndpointDefinitions>(
  definition: API,
): QueryKeyResolver<API> => {
  const result = (key: any) => {
    return key;
  };

  result.forEndpoint = (endpoint: any, request: any) => {
    const endpointDef = definition[endpoint];

    if (endpointDef.apiQuery?.queryKey) {
      return endpointDef.apiQuery.queryKey(request as any);
    }

    return [endpoint, request] as any;
  };

  return result as any;
};

export type ToReadonly<T> = T extends readonly any[] ? Readonly<T> : never;

type OnlyString<T> = T extends string ? T : never;
export type QueryConfig<
  API extends APIEndpointDefinitions,
  KEYS extends QueryKeyItem[] = QueryKeyItem[],
> = {
  [K in keyof API]?: {
    invalidates?: (input: {
      request: SchemaInferInput<API[K]['request']>;
      response: SchemaInferOutput<API[K]['response']>;
    }) => KEYS[];

    errorInvalidates?: (input: {
      request: SchemaInferInput<API[K]['request']>;
      error: Error;
    }) => KEYS[];

    queryOptions?: Omit<
      UseQueryOptions<
        SchemaInferOutput<API[K]['response']>,
        Error,
        SchemaInferOutput<API[K]['response']>,
        QueryKeyForEndpoint<OnlyString<K>, API[K]>
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

export type APIQueryOptions<
  DEF extends AnyEndpointDefinition,
  KEYS extends QueryKeyItem[] = QueryKeyItem[],
> = {
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

export type APIQueryHook<
  API extends APIEndpointDefinitions,
  KEYS extends QueryKeyItem[],
> = <ENDPOINT extends keyof API>(
  endpoint: ENDPOINT,
  ...rest: SchemaInferInput<API[ENDPOINT]['request']> extends never
    ? [options?: APIQueryOptions<API[ENDPOINT], KEYS>]
    : [options: APIQueryOptions<API[ENDPOINT], KEYS>]
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

interface MountedQueries<
  API extends APIEndpointDefinitions,
  KEYS extends QueryKeyItem[],
> {
  useAPIQuery: APIQueryHook<API, KEYS>;
  useAPIMutation: APIMutationHook<API>;
}

export const mountAPIQueryClient = <
  API extends APIEndpointDefinitions,
  KEYS extends QueryKeyItem[] = QueryKeyItem[],
>(
  client: APIClient<API>,
  queryClient: QueryClient,
  globalConfig: QueryConfig<API, KEYS>,
): MountedQueries<API, KEYS> => {
  const getEndpointConfig = <K extends keyof API>(endpoint: K) => {
    return globalConfig[endpoint] || {};
  };

  // biome-ignore lint/complexity/useLiteralKeys: Private property access
  const makeKey = makeQueryKeyResolver(client['definitions']);

  client.$failed.subscribe(({ endpoint, error, request }) => {
    const keys = getEndpointConfig(endpoint)?.errorInvalidates?.({
      error,
      request,
    });
    if (keys?.length) {
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    }
  });

  client.$succeeded.subscribe(({ endpoint, request, response }) => {
    const keys = getEndpointConfig(endpoint).invalidates?.({
      request,
      response,
    });
    if (keys?.length) {
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    }
  });

  const useAPIQuery: any = (endpoint: string, ...rest: any[]) => {
    const options = rest[0];
    const conf = getEndpointConfig(endpoint);

    return useQuery({
      queryKey: makeKey.forEndpoint(
        endpoint,
        options?.data ?? undefined,
      ) as any,
      enabled:
        options?.data === null ? false : (options?.overrides?.enabled ?? true),
      queryFn: async ({ signal }: { signal: any }) => {
        const response = await client.request(endpoint, {
          request: (options?.data ?? null) as any,
          abort: signal,
        });
        return response;
      },
      ...conf.queryOptions,
      ...options?.overrides,
    } as any);
  };

  const useAPIMutation: APIMutationHook<API> = (endpoint, options) => {
    const conf = getEndpointConfig(endpoint);
    return useMutation({
      mutationFn: async (input) => {
        const response = await client.request(endpoint, {
          request: input as any,
        });
        return response;
      },
      ...conf.mutationOptions,
      ...(options?.overrides as any),
    });
  };

  return {
    useAPIQuery,
    useAPIMutation,
  };
};
