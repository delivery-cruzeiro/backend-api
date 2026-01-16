import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { auth } from './lib/auth.js';
import { authRoutes } from './routes/auth.routes.js';
import { userRoutes } from './routes/user.routes.js';

// Carregar variáveis de ambiente
console.log('📦 Carregando variáveis de ambiente...');
dotenv.config();
console.log('✅ Variáveis de ambiente carregadas');

// Criar instância do Fastify
console.log('🔧 Criando instância do Fastify...');
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});
console.log('✅ Instância do Fastify criada');

// Registrar plugins
const startServer = async () => {
  try {
    console.log('🔌 Registrando plugin CORS...');
    // Configurar CORS
    await fastify.register(cors, {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
    });
    console.log('✅ CORS registrado');

    console.log('🛡️ Registrando plugin Helmet...');
    // Configurar Helmet para segurança
    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    });
    console.log('✅ Helmet registrado');

    console.log('⚡ Registrando plugin Rate Limit...');
    // Configurar Rate Limiting
    await fastify.register(rateLimit, {
      max: 100, // máximo de 100 requisições por janela
      timeWindow: '1 minute', // janela de 1 minuto
    });
    console.log('✅ Rate Limit registrado');

    console.log('📝 Registrando rotas...');

    // Adicionar middleware global para Better Auth
    fastify.addHook('onRequest', async (_request, reply) => {
      reply.header('Access-Control-Allow-Credentials', 'true');
    });
    // Endpoint de health check
    fastify.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    });

    // Endpoint de teste base
    fastify.get('/api/test', async () => {
      return {
        message: 'API funcionando corretamente!',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      };
    });

    // Endpoint para Better Auth handler
    fastify.all('/api/auth/*', async (request, reply) => {
      const url = new URL(request.url, 'http://localhost:4000');
      const authRequest = new Request(url.toString(), {
        method: request.method,
        headers: request.headers as HeadersInit,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      const authResponse = await auth.handler(authRequest);
      
      // Copiar headers da resposta do Better Auth
      authResponse.headers.forEach((value: string, key: string) => {
        reply.header(key, value);
      });

      // Enviar status e corpo
      reply.status(authResponse.status);
      return reply.send(await authResponse.text());
    });

    // Registrar rotas de autenticação
    await fastify.register(authRoutes, { prefix: '/api' });
    console.log('✅ Rotas de autenticação registradas');

    // Registrar rotas de usuários
    await fastify.register(userRoutes, { prefix: '/api' });
    console.log('✅ Rotas de usuários registradas');
    console.log('✅ Rotas registradas');

    // Iniciar servidor
    const port = Number(process.env.PORT) || 4000;
    const host = process.env.HOST || '0.0.0.0';
    console.log(`🚀 Iniciando servidor em ${host}:${port}...`);

    await fastify.listen({ port, host });

    console.log(`✅ Servidor rodando em http://${host}:${port}`);
    console.log(`📚 Documentação: http://${host}:${port}/docs`);
  } catch (err) {
    console.error('❌ Erro ao iniciar servidor:', err);
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('🛑 Iniciando graceful shutdown...');
  await fastify.close();
  console.log('✅ Servidor encerrado com sucesso');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Iniciar servidor
console.log('🎬 Iniciando configuração do servidor...');
startServer();
