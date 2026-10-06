import type { AnyEndpointDefinition, EndpointDefinition } from './endpoint';
import { APIClientError } from './errors';
import type {
  SchemaInferInput,
  SchemaInferOutput,
  SchemaValue,
} from './schema';
import type { APIEndpointDefinitions } from './types';

/** The untyped batch mapping stored on a virtual endpoint definition. */
export type AnyBatchConfig = {
  via: string;
  toRequest: (requests: any[]) => unknown;
  fromResponse: (response: any, request: any) => unknown;
  key?: (request: any) => unknown;
  windowMs?: number;
  maxBatchSize?: number;
};

export type BatchedEndpointDefinition<
  REQUEST extends SchemaValue,
  RESPONSE extends SchemaValue,
> = EndpointDefinition<REQUEST, RESPONSE, Record<string, never>> & {
  batch: AnyBatchConfig;
};

/** Keys of endpoints that go through the resolver, i.e. not virtual. */
export type RealEndpointKeys<T> = {
  [K in keyof T]: T[K] extends { batch: AnyBatchConfig } ? never : K;
}[keyof T];

export type BatchedEndpointConfig<
  API extends APIEndpointDefinitions,
  VIA extends keyof API,
  REQUEST extends SchemaValue,
  RESPONSE extends SchemaValue,
> = {
  /** The real endpoint that serves a whole batch. */
  via: VIA;
  /** Schema for a single item's request. */
  request: REQUEST;
  /** Schema for a single item's response. */
  response: RESPONSE;
  /** Combine the queued single-item requests into one `via` request. */
  toRequest: (
    requests: SchemaInferOutput<REQUEST>[],
  ) => SchemaInferInput<API[VIA]['request']>;
  /**
   * Pick a single item's response out of the `via` response. Returning
   * `undefined` fails that request with a "missing item" error, unless
   * `response` is `null`.
   */
  fromResponse: (
    response: SchemaInferOutput<API[VIA]['response']>,
    request: SchemaInferOutput<REQUEST>,
  ) => SchemaInferInput<RESPONSE> | undefined;
  /** Requests with the same key are sent once. Without it, nothing is deduped. */
  key?: (request: SchemaInferOutput<REQUEST>) => unknown;
  /**
   * How long after the first queued request to send the batch. Defaults to
   * `0`, which sends in a `setTimeout(0)` macrotask.
   */
  windowMs?: number;
  /** Send as soon as this many unique requests are queued. */
  maxBatchSize?: number;
};

export type BatchedEndpointBuilder<API extends APIEndpointDefinitions> = <
  VIA extends RealEndpointKeys<API>,
  REQUEST extends SchemaValue,
  RESPONSE extends SchemaValue,
>(
  config: BatchedEndpointConfig<API, VIA, REQUEST, RESPONSE>,
) => BatchedEndpointDefinition<REQUEST, RESPONSE>;

export const isBatchedEndpoint = (
  definition: AnyEndpointDefinition,
): definition is BatchedEndpointDefinition<SchemaValue, SchemaValue> =>
  'batch' in definition && definition.batch != null;

const batched: BatchedEndpointBuilder<any> = ({
  request,
  response,
  ...batch
}) => ({
  request,
  response,
  metadata: {},
  batch: batch as AnyBatchConfig,
});

/**
 * Add client-only endpoints that are resolved in batches through a real
 * endpoint. Calls queued within `windowMs` of the first one are combined into
 * one request to `via`; each caller still gets its own validated response and
 * `$succeeded` / `$failed` event. The server never sees virtual endpoints.
 * Virtual endpoint names must not clash with real ones.
 *
 * @example
 *   const clientApi = defineVirtualEndpoints(api, (batched) => ({
 *     getThumbnail: batched({
 *       via: 'getThumbnails',
 *       request: z.object({ fileId: z.string() }),
 *       response: Thumbnail,
 *       toRequest: (reqs) => ({ fileIds: reqs.map((r) => r.fileId) }),
 *       fromResponse: (res, req) =>
 *         res.items.find((t) => t.fileId === req.fileId),
 *       windowMs: 20,
 *     }),
 *   }));
 *
 *   const client = new APIClient(clientApi, { resolver });
 */
export const defineVirtualEndpoints = <
  API extends APIEndpointDefinitions,
  VIRTUAL extends Record<
    string,
    BatchedEndpointDefinition<SchemaValue, SchemaValue>
  >,
>(
  api: API,
  build: (
    batched: BatchedEndpointBuilder<API>,
  ) => VIRTUAL & { [K in keyof API]?: never },
): API & VIRTUAL => {
  const virtual = build(batched);
  for (const name of Object.keys(virtual)) {
    if (name in api) {
      throw new APIClientError(
        `Virtual endpoint "${name}" clashes with a real endpoint`,
      );
    }
  }
  return { ...api, ...virtual };
};
