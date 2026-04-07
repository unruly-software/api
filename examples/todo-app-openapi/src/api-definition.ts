import { defineAPI } from '@unruly-software/api-client';
import { z } from 'zod';
import {
  CreateTodoSchema,
  ErrorResponseSchema,
  GetTodoParamsSchema,
  GetTodosQuerySchema,
  TodoItemSchema,
  TodoListResponseSchema,
  UpdateTodoSchema,
} from './schemas.js';

const DeleteTodoResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const api = defineAPI<{
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  description: string;
  tags: string[];
}>();

export const todoAPI = {
  getTodos: api.defineEndpoint({
    request: GetTodosQuerySchema,
    response: z.union([
      TodoListResponseSchema.meta({
        statusCode: 200,
        description: 'List of todos',
      }),
      ErrorResponseSchema.meta({
        statusCode: 400,
        description: 'Invalid query parameters',
      }),
    ]),
    metadata: {
      method: 'GET',
      path: '/todos',
      summary: 'Get all todos',
      description: 'Retrieve a list of todos with optional filtering',
      tags: ['Todos'],
    },
  }),

  getTodo: api.defineEndpoint({
    request: GetTodoParamsSchema,
    response: z.union([
      TodoItemSchema.meta({ statusCode: 200, description: 'Todo found' }),
      ErrorResponseSchema.meta({
        statusCode: 404,
        description: 'Todo not found',
      }),
    ]),
    metadata: {
      method: 'GET',
      path: '/todos/{id}',
      summary: 'Get a todo by ID',
      description: 'Retrieve a specific todo item by its ID',
      tags: ['Todos'],
    },
  }),

  createTodo: api.defineEndpoint({
    request: CreateTodoSchema,
    response: z.union([
      TodoItemSchema.meta({
        statusCode: 201,
        description: 'Todo created successfully',
      }),
      ErrorResponseSchema.meta({
        statusCode: 400,
        description: 'Invalid request data',
      }),
    ]),
    metadata: {
      method: 'POST',
      path: '/todos',
      summary: 'Create a new todo',
      description: 'Create a new todo item',
      tags: ['Todos'],
    },
  }),

  updateTodo: api.defineEndpoint({
    request: z
      .object({
        id: GetTodoParamsSchema.shape.id,
      })
      .merge(UpdateTodoSchema),
    response: z.union([
      TodoItemSchema.meta({
        statusCode: 200,
        description: 'Todo updated successfully',
      }),
      ErrorResponseSchema.meta({
        statusCode: 400,
        description: 'Invalid request data',
      }),
      ErrorResponseSchema.meta({
        statusCode: 404,
        description: 'Todo not found',
      }),
    ]),
    metadata: {
      method: 'PUT',
      path: '/todos/{id}',
      summary: 'Update a todo',
      description: 'Update an existing todo item by its ID',
      tags: ['Todos'],
    },
  }),

  deleteTodo: api.defineEndpoint({
    request: GetTodoParamsSchema,
    response: z.union([
      DeleteTodoResponseSchema.meta({
        statusCode: 200,
        description: 'Todo deleted successfully',
      }),
      ErrorResponseSchema.meta({
        statusCode: 404,
        description: 'Todo not found',
      }),
    ]),
    metadata: {
      method: 'DELETE',
      path: '/todos/{id}',
      summary: 'Delete a todo',
      description: 'Delete a todo item by its ID',
      tags: ['Todos'],
    },
  }),
} as const;
