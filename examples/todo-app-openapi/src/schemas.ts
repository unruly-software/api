import { z } from 'zod';
import 'zod-openapi';

const numberString = z.number().int().min(1).meta({
  description: 'A positive integer',
  example: 1,
});

export const TodoItemSchema = z
  .object({
    id: numberString.meta({
      description: 'Unique identifier for the todo item',
      example: 1,
    }),
    title: z.string().meta({
      description: 'The title of the todo item',
      example: 'Buy groceries',
    }),
    description: z.string().optional().meta({
      description: 'Optional detailed description of the todo item',
      example: 'Buy milk, eggs, and bread from the grocery store',
    }),
    completed: z.boolean().meta({
      description: 'Whether the todo item has been completed',
      example: false,
    }),
    priority: z.enum(['low', 'medium', 'high']).optional().meta({
      description: 'Priority level of the todo item',
      example: 'medium',
    }),
    dueDate: z.string().datetime().optional().meta({
      description: 'ISO datetime string for when the todo is due',
      example: '2024-12-31T23:59:59.000Z',
    }),
    createdAt: z.string().datetime().meta({
      description: 'ISO datetime string for when the todo was created',
      example: '2024-01-01T00:00:00.000Z',
    }),
    updatedAt: z.string().datetime().meta({
      description: 'ISO datetime string for when the todo was last updated',
      example: '2024-01-02T12:30:00.000Z',
    }),
  })
  .meta({
    description: 'A todo item with all its properties',
  });

export const CreateTodoSchema = z
  .object({
    title: z.string().min(1).meta({
      description: 'The title of the todo item',
      example: 'Buy groceries',
    }),
    description: z.string().optional().meta({
      description: 'Optional detailed description of the todo item',
      example: 'Buy milk, eggs, and bread from the grocery store',
    }),
    priority: z.enum(['low', 'medium', 'high']).optional().meta({
      description: 'Priority level of the todo item',
      example: 'medium',
    }),
    dueDate: z.string().datetime().optional().meta({
      description: 'ISO datetime string for when the todo is due',
      example: '2024-12-31T23:59:59.000Z',
    }),
  })
  .meta({
    description: 'Schema for creating a new todo item',
  });

export const UpdateTodoSchema = z
  .object({
    title: z.string().min(1).optional().meta({
      description: 'The title of the todo item',
      example: 'Buy groceries',
    }),
    description: z.string().optional().meta({
      description: 'Optional detailed description of the todo item',
      example: 'Buy milk, eggs, and bread from the grocery store',
    }),
    completed: z.boolean().optional().meta({
      description: 'Whether the todo item has been completed',
      example: false,
    }),
    priority: z.enum(['low', 'medium', 'high']).optional().meta({
      description: 'Priority level of the todo item',
      example: 'medium',
    }),
    dueDate: z.string().datetime().optional().meta({
      description: 'ISO datetime string for when the todo is due',
      example: '2024-12-31T23:59:59.000Z',
    }),
  })
  .meta({
    description: 'Schema for updating an existing todo item',
  });

export const GetTodoParamsSchema = z
  .object({
    id: numberString.meta({
      description: 'The unique identifier of the todo item',
      example: 1,
    }),
  })
  .meta({
    description: 'Parameters for getting a specific todo item',
  });

export const GetTodosQuerySchema = z
  .object({
    completed: z.boolean().optional().meta({
      description: 'Filter todos by completion status',
      example: false,
    }),
    priority: z.enum(['low', 'medium', 'high']).optional().meta({
      description: 'Filter todos by priority level',
      example: 'high',
    }),
    limit: numberString.optional().meta({
      description: 'Maximum number of todos to return',
      example: 10,
    }),
    offset: numberString.optional().meta({
      description: 'Number of todos to skip',
      example: 0,
    }),
  })
  .meta({
    description: 'Query parameters for filtering and paginating todos',
  });

export const TodoListResponseSchema = z
  .object({
    todos: z.array(TodoItemSchema).meta({
      description: 'Array of todo items',
    }),
    total: z.number().meta({
      description: 'Total number of todos matching the query',
      example: 42,
    }),
    limit: z.number().optional().meta({
      description: 'The limit used for this query',
      example: 10,
    }),
    offset: z.number().optional().meta({
      description: 'The offset used for this query',
      example: 0,
    }),
  })
  .meta({
    description: 'Response containing a list of todos with pagination info',
  });

export const ErrorResponseSchema = z
  .object({
    error: z.string().meta({
      description: 'Error message describing what went wrong',
      example: 'Todo item not found',
    }),
    code: z.string().optional().meta({
      description: 'Optional error code for programmatic handling',
      example: 'TODO_NOT_FOUND',
    }),
  })
  .meta({
    description: 'Error response schema',
  });

export type TodoItem = z.infer<typeof TodoItemSchema>;
export type CreateTodo = z.infer<typeof CreateTodoSchema>;
export type UpdateTodo = z.infer<typeof UpdateTodoSchema>;
export type GetTodoParams = z.infer<typeof GetTodoParamsSchema>;
export type GetTodosQuery = z.infer<typeof GetTodosQuerySchema>;
export type TodoListResponse = z.infer<typeof TodoListResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
