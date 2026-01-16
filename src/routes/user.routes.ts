import type { FastifyInstance } from 'fastify';
import { createUser, getUsers, getUserById, updateUser, deleteUser } from '../controllers/user.controller.js';

export async function userRoutes(fastify: FastifyInstance) {
  // Criar novo usuário (rota solicitada)
  fastify.post('/new-user', {
    schema: {
      description: 'Criar um novo usuário',
      tags: ['Usuários'],
      body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          name: { type: 'string' },
          phone: { type: 'string' },
          role: { 
            type: 'string', 
            enum: ['CLIENT', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'],
            default: 'CLIENT' 
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                phone: { type: 'string' },
                avatar: { type: 'string' },
                role: { type: 'string' },
                isActive: { type: 'boolean' },
                emailVerified: { type: 'string', nullable: true },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, createUser);

  // Listar todos os usuários
  fastify.get('/users', {
    schema: {
      description: 'Listar todos os usuários',
      tags: ['Usuários'],
      response: {
        200: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  phone: { type: 'string' },
                  avatar: { type: 'string' },
                  role: { type: 'string' },
                  isActive: { type: 'boolean' },
                  emailVerified: { type: 'string', nullable: true },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
            },
            total: { type: 'number' },
          },
        },
      },
    },
  }, getUsers);

  // Buscar usuário por ID
  fastify.get('/users/:id', {
    schema: {
      description: 'Buscar usuário por ID',
      tags: ['Usuários'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                phone: { type: 'string' },
                avatar: { type: 'string' },
                role: { type: 'string' },
                isActive: { type: 'boolean' },
                emailVerified: { type: 'string', nullable: true },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' },
                addresses: { type: 'array' },
                paymentMethods: { type: 'array' },
                orders: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      status: { type: 'string' },
                      total: { type: 'number' },
                      createdAt: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, getUserById);

  // Atualizar usuário
  fastify.put('/users/:id', {
    schema: {
      description: 'Atualizar usuário',
      tags: ['Usuários'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          phone: { type: 'string' },
          role: { 
            type: 'string', 
            enum: ['CLIENT', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'] 
          },
          isActive: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                phone: { type: 'string' },
                avatar: { type: 'string' },
                role: { type: 'string' },
                isActive: { type: 'boolean' },
                emailVerified: { type: 'string', nullable: true },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, updateUser);

  // Deletar usuário
  fastify.delete('/users/:id', {
    schema: {
      description: 'Deletar usuário',
      tags: ['Usuários'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, deleteUser);
}
