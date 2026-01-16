import type { FastifyInstance } from 'fastify';
import { register, login, logout, getMe, refreshToken } from '../controllers/auth.controller.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Registro de usuário (rota customizada)
  fastify.post('/auth/register', {
    schema: {
      description: 'Registrar um novo usuário',
      tags: ['Autenticação'],
      body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          name: { type: 'string' },
          phone: { type: 'string' },
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
      },
    },
  }, register);

  // Login (rota customizada)
  fastify.post('/auth/login', {
    schema: {
      description: 'Fazer login',
      tags: ['Autenticação'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
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
              },
            },
            session: {
              type: 'object',
              properties: {
                token: { type: 'string' },
                expiresAt: { type: 'string' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, login);

  // Logout (rota customizada)
  fastify.post('/auth/logout', {
    schema: {
      description: 'Fazer logout',
      tags: ['Autenticação'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  }, logout);

  // Obter usuário atual (rota customizada)
  fastify.get('/auth/me', {
    schema: {
      description: 'Obter usuário autenticado',
      tags: ['Autenticação'],
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
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, getMe);

  // Refresh token (rota customizada)
  fastify.post('/auth/refresh', {
    schema: {
      description: 'Refresh token',
      tags: ['Autenticação'],
      response: {
        200: {
          type: 'object',
          properties: {
            session: {
              type: 'object',
              properties: {
                token: { type: 'string' },
                expiresAt: { type: 'string' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, refreshToken);
}
