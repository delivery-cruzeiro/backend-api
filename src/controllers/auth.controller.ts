import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LoginUserDTO, RegisterUserDTO } from '@delivery-cruzeiro/types';
import { auth } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

type AuthEndpointOptions = {
	method?: 'GET' | 'POST';
	body?: Record<string, unknown>;
};

const authBaseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:4000';

const publicUserSelect = {
	id: true,
	email: true,
	name: true,
	gender: true,
	phone: true,
	avatar: true,
	role: true,
	isActive: true,
	emailVerified: true,
	createdAt: true,
	updatedAt: true,
} as const;

function toHeaders(headers: FastifyRequest['headers']) {
	const nextHeaders = new Headers();

	for (const [key, value] of Object.entries(headers)) {
		if (value === undefined) {
			continue;
		}

		if (Array.isArray(value)) {
			nextHeaders.set(key, value.join(', '));
			continue;
		}

		nextHeaders.set(key, String(value));
	}

	return nextHeaders;
}

function copyAuthHeaders(response: Response, reply: FastifyReply) {
	response.headers.forEach((value, key) => {
		if (key.toLowerCase() === 'set-cookie' || key.toLowerCase() === 'content-length') {
			return;
		}

		reply.header(key, value);
	});

	const getSetCookie = response.headers as Headers & {
		getSetCookie?: () => string[];
	};
	const cookies = getSetCookie.getSetCookie?.() ?? [];
	const fallbackCookie = response.headers.get('set-cookie');

	if (cookies.length > 0) {
		reply.header('set-cookie', cookies);
	} else if (fallbackCookie) {
		reply.header('set-cookie', fallbackCookie);
	}
}

async function readAuthResponse(response: Response) {
	const text = await response.text();

	if (!text) {
		return null;
	}

	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return { message: text };
	}
}

async function callAuthEndpoint(
	request: FastifyRequest,
	path: string,
	{ method = 'POST', body }: AuthEndpointOptions = {}
) {
	const url = new URL(path, authBaseURL);
	const headers = toHeaders(request.headers);
	headers.set('accept', 'application/json');

	if (body) {
		headers.set('content-type', 'application/json');
	}

	return auth.handler(
		new Request(url.toString(), {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		})
	);
}

function getAuthError(payload: Record<string, unknown> | null, fallback: string) {
	if (!payload) {
		return fallback;
	}

	if (typeof payload.message === 'string') {
		return payload.message;
	}

	if (typeof payload.error === 'string') {
		return payload.error;
	}

	return fallback;
}

async function findPublicUser(userId?: string, email?: string) {
	if (userId) {
		return prisma.user.findUnique({
			where: { id: userId },
			select: publicUserSelect,
		});
	}

	if (email) {
		return prisma.user.findUnique({
			where: { email },
			select: publicUserSelect,
		});
	}

	return null;
}

function getSessionUserId(payload: Record<string, unknown> | null) {
	const user = payload?.user;

	if (user && typeof user === 'object' && 'id' in user && typeof user.id === 'string') {
		return user.id;
	}

	return undefined;
}

export const register = async (
	request: FastifyRequest<{ Body: RegisterUserDTO }>,
	reply: FastifyReply
) => {
	try {
		const { email, password, name, phone } = request.body;
		const existingUser = await prisma.user.findUnique({
			where: { email },
			select: { id: true },
		});

		if (existingUser) {
			return reply.status(400).send({
				error: 'Email ja cadastrado',
			});
		}

		const authResponse = await callAuthEndpoint(request, '/api/auth/sign-up/email', {
			body: {
				email,
				password,
				name,
				phone,
			},
		});
		copyAuthHeaders(authResponse, reply);

		const payload = await readAuthResponse(authResponse);

		if (!authResponse.ok) {
			return reply.status(authResponse.status).send({
				error: getAuthError(payload, 'Nao foi possivel criar a conta'),
			});
		}

		const user = await findPublicUser(getSessionUserId(payload), email);

		return reply.status(201).send({
			message: 'Usuario criado com sucesso',
			user,
			session: payload?.session ?? null,
		});
	} catch (error) {
		request.log.error(error, 'Erro ao registrar usuario');
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const login = async (
	request: FastifyRequest<{ Body: LoginUserDTO }>,
	reply: FastifyReply
) => {
	try {
		const { email, password } = request.body;
		const userBeforeLogin = await prisma.user.findUnique({
			where: { email },
			select: {
				id: true,
				isActive: true,
			},
		});

		if (!userBeforeLogin) {
			return reply.status(401).send({
				error: 'Credenciais invalidas',
			});
		}

		if (!userBeforeLogin.isActive) {
			return reply.status(403).send({
				error: 'Usuario desativado',
			});
		}

		const authResponse = await callAuthEndpoint(request, '/api/auth/sign-in/email', {
			body: {
				email,
				password,
			},
		});
		copyAuthHeaders(authResponse, reply);

		const payload = await readAuthResponse(authResponse);

		if (!authResponse.ok) {
			return reply.status(401).send({
				error: getAuthError(payload, 'Credenciais invalidas'),
			});
		}

		const user = await findPublicUser(getSessionUserId(payload), email);

		return reply.send({
			message: 'Login realizado com sucesso',
			user,
			session: payload?.session ?? null,
		});
	} catch (error) {
		request.log.error(error, 'Erro ao fazer login');
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const logout = async (request: FastifyRequest, reply: FastifyReply) => {
	try {
		const authResponse = await callAuthEndpoint(request, '/api/auth/sign-out');
		copyAuthHeaders(authResponse, reply);
		const payload = await readAuthResponse(authResponse);

		if (!authResponse.ok) {
			return reply.status(authResponse.status).send({
				error: getAuthError(payload, 'Nao foi possivel encerrar a sessao'),
			});
		}

		return reply.send({
			message: 'Logout realizado com sucesso',
		});
	} catch (error) {
		request.log.error(error, 'Erro ao fazer logout');
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const getMe = async (request: FastifyRequest, reply: FastifyReply) => {
	try {
		const authResponse = await callAuthEndpoint(request, '/api/auth/get-session', {
			method: 'GET',
		});
		copyAuthHeaders(authResponse, reply);
		const payload = await readAuthResponse(authResponse);

		if (!authResponse.ok || !payload) {
			return reply.status(401).send({
				error: 'Nao autenticado',
			});
		}

		const user = await findPublicUser(getSessionUserId(payload));

		if (!user) {
			return reply.status(401).send({
				error: 'Usuario nao encontrado',
			});
		}

		if (!user.isActive) {
			return reply.status(403).send({
				error: 'Usuario desativado',
			});
		}

		return reply.send({
			user,
			session: payload.session ?? null,
		});
	} catch (error) {
		request.log.error(error, 'Erro ao obter usuario');
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const refreshToken = async (request: FastifyRequest, reply: FastifyReply) => {
	try {
		const authResponse = await callAuthEndpoint(request, '/api/auth/get-session', {
			method: 'GET',
		});
		copyAuthHeaders(authResponse, reply);
		const payload = await readAuthResponse(authResponse);

		if (!authResponse.ok || !payload) {
			return reply.status(401).send({
				error: 'Sessao invalida ou expirada',
			});
		}

		const user = await findPublicUser(getSessionUserId(payload));

		if (!user?.isActive) {
			return reply.status(403).send({
				error: 'Usuario desativado',
			});
		}

		return reply.send({
			user,
			session: payload.session ?? null,
		});
	} catch (error) {
		request.log.error(error, 'Erro ao renovar sessao');
		return reply.status(401).send({
			error: 'Sessao invalida ou expirada',
		});
	}
};
