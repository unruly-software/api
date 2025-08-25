import type {
  AnyEndpointDefinition,
  APIEndpointDefinitions,
  SchemaInferInput,
  SchemaInferOutput,
  SchemaValue,
} from '@unruly-software/api-client';

export type ImplementedAPIRouter<API extends APIEndpointDefinitions, CTX> = {
  dispatch: <K extends keyof API>(args: {
    endpoint: K;
    data: unknown;
    context: CTX;
  }) => Promise<SchemaServerResponse<API[K]['response']>>;

  definitions: API;
  endpoints: {
    [K in keyof API]: FinalizedAPIRoute<API[K], any, CTX>;
  };
};

export type APIRouter<API extends APIEndpointDefinitions, CTX> = {
  endpoint<K extends keyof API>(endpoint: K): APIRoute<API[K], CTX, CTX>;

  implement: (args: {
    endpoints: {
      [K in keyof API]: FinalizedAPIRoute<API[K], any, CTX>;
    };
  }) => ImplementedAPIRouter<API, CTX>;
};

export type SchemaServerResponse<S extends SchemaValue> =
  SchemaInferInput<S> extends never ? void : SchemaInferInput<S>;

export type APIRoute<DEF extends AnyEndpointDefinition, CTX, INIT_CTX> = {
  handle: (
    handler: (input: {
      data: SchemaInferOutput<DEF['request']>;
      definition: DEF;
      context: CTX;
    }) => Promise<SchemaServerResponse<DEF['response']>>,
  ) => FinalizedAPIRoute<DEF, CTX, INIT_CTX>;

  updateContext: <NEW_CTX>(
    updater: (context: CTX) => Promise<NEW_CTX>,
  ) => APIRoute<DEF, NEW_CTX, INIT_CTX>;
};

type FinalizedAPIRoute<DEF extends AnyEndpointDefinition, CTX, INIT_CTX> = {
  handle: (input: {
    data: SchemaInferOutput<DEF['request']>;
    context: INIT_CTX;
  }) => Promise<SchemaServerResponse<DEF['response']>>;

  /** Skip middleware, directly invoke the function */
  handleDirect: (input: {
    data: SchemaInferOutput<DEF['request']>;
    context: CTX;
  }) => Promise<SchemaServerResponse<DEF['response']>>;
};

export const defineRouter = <API extends APIEndpointDefinitions, CTX>(input: {
  definitions: API;
}): APIRouter<API, CTX> => {
  const { definitions } = input;

  const getDefinition = <K extends keyof API>(endpoint: K): API[K] => {
    const def = definitions[endpoint];
    if (!def) {
      throw new Error(`No definition for endpoint ${String(endpoint)}`);
    }
    return def;
  };

  const makeEndpoint = <K extends keyof API, CTX, INIT_CTX>(
    endpoint: K,
    makeContext: (initial: INIT_CTX) => Promise<CTX>,
  ): APIRoute<API[K], CTX, INIT_CTX> => {
    return {
      handle: (handler) => {
        return {
          handle: async ({ context, data }) => {
            return handler({
              context: await makeContext(context),
              data,
              definition: getDefinition(endpoint),
            });
          },
          handleDirect: async ({ context, data }) => {
            return handler({
              context,
              data,
              definition: getDefinition(endpoint),
            });
          },
        };
      },
      updateContext: (updater) => {
        return makeEndpoint(endpoint, async (initial) =>
          updater(await makeContext(initial)),
        );
      },
    };
  };

  return {
    endpoint: (endpoint) => makeEndpoint(endpoint, async (ctx) => ctx),
    implement: ({ endpoints }) => ({
      endpoints,
      definitions,
      dispatch: async ({ endpoint, context, data }) => {
        const definition = getDefinition(endpoint);
        const endpointImpl = endpoints[endpoint];
        if (!endpointImpl) {
          throw new Error(`No implementation for endpoint ${String(endpoint)}`);
        }

        const requestData = definition.request?.parse(data);

        const output = await endpointImpl.handle({
          context,
          data: requestData as any,
        });

        const responseData = definition.response?.parse(output);

        return responseData as any;
      },
    }),
  };
};
