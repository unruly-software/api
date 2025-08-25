import type { z } from 'zod';

export type SchemaValue = z.Schema | null;

export type SchemaInferInput<TSchema extends SchemaValue> =
  TSchema extends z.Schema ? z.input<TSchema> : never;

export type SchemaInferOutput<TSchema extends SchemaValue> =
  TSchema extends z.Schema ? z.infer<TSchema> : never;
