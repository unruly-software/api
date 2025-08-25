import type {
  SchemaInferInput,
  SchemaInferOutput,
  SchemaValue,
} from './schema';

export type EndpointInput<T extends AnyEndpointDefinition> =
  T extends EndpointDefinition<infer REQUEST, any, any>
    ? SchemaInferInput<REQUEST>
    : never;

export type EndpointOutput<T extends AnyEndpointDefinition> =
  T extends EndpointDefinition<any, infer RESPONSE, any>
    ? SchemaInferOutput<RESPONSE>
    : never;

export type EndpointDefinition<
  REQUEST extends SchemaValue,
  RESPONSE extends SchemaValue,
  METADATA extends Record<string, unknown>,
> = {
  request: REQUEST;
  response: RESPONSE;
  metadata: METADATA;
};

export type AnyEndpointDefinition = EndpointDefinition<
  SchemaValue,
  SchemaValue,
  Record<string, unknown>
>;

export const defineAPI = <METADATA extends Record<string, unknown>>() => {
  return {
    defineEndpoint: <REQUEST extends SchemaValue, RESPONSE extends SchemaValue>(
      definition: EndpointDefinition<REQUEST, RESPONSE, METADATA>,
    ) => definition,
  };
};
