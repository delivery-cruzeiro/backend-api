import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { auth } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { hasUrlCredential, isAllowedOrigin } from '../security/config.js';
import { sessionEvents } from '../security/session-events.js';
import {
	ADMIN_ORDERS_CHANGED_EVENT,
	ATTENDANTS_ROOM,
	type OrderEventsEmitter,
} from '../events/order-events.emitter.js';

type SocketCorsOrigin =
	| boolean
	| string
	| string[]
	| RegExp
	| ((origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void);

interface SocketGatewayOptions {
	corsOrigin: SocketCorsOrigin;
	eventEmitter: OrderEventsEmitter;
	httpServer: HttpServer;
}

const availableRooms = new Set([ATTENDANTS_ROOM]);

export class SocketGateway {
	private readonly io: Server;
	private readonly unsubscribeOrderChanged: () => void;
	private readonly revoke = (userId: string) => this.io.in(`user:${userId}`).disconnectSockets(true);

	constructor({ corsOrigin, eventEmitter, httpServer }: SocketGatewayOptions) {
		this.io = new Server(httpServer, {
			maxHttpBufferSize: 16384,
			allowRequest: (req, callback) => callback(null, !hasUrlCredential(req.url || '/') && isAllowedOrigin(req.headers.origin)),
			cors: {
				credentials: true,
				origin: corsOrigin,
			},
		});
		this.io.use(async (socket, next) => {
			try {
				const session = await auth.api.getSession({headers: socket.request.headers as Record<string,string>});
				const user = session ? await prisma.user.findUnique({where:{id:session.user.id},select:{id:true,isActive:true,role:true}}) : null;
				if (!user?.isActive || !['ADMIN','SUPER_ADMIN','MANAGER'].includes(user.role)) return next(new Error('Nao autenticado'));
				socket.data.userId = user.id;
				await socket.join(`user:${user.id}`);
				const timer = setTimeout(()=>socket.disconnect(true), Math.max(0,new Date(session!.session.expiresAt).getTime()-Date.now()));
				timer.unref();
				socket.once('disconnect',()=>clearTimeout(timer));
				next();
			} catch { next(new Error('Nao autenticado')); }
		});
		sessionEvents.on('revoked',this.revoke);

		this.io.on('connection', socket => this.handleConnection(socket));
		this.unsubscribeOrderChanged = eventEmitter.onOrderChanged(payload => {
			void this.broadcastAuthorized(payload);
		});
	}

	private async broadcastAuthorized(payload: unknown) {
		for (const socket of this.io.sockets.sockets.values()) {
			if (!socket.rooms.has(ATTENDANTS_ROOM)) continue;
			try {
				const session = await auth.api.getSession({headers:socket.request.headers as Record<string,string>});
				const user = session ? await prisma.user.findUnique({where:{id:session.user.id},select:{isActive:true,role:true}}) : null;
				if (!user?.isActive || !['ADMIN','SUPER_ADMIN','MANAGER'].includes(user.role)) socket.disconnect(true);
				else socket.emit(ADMIN_ORDERS_CHANGED_EVENT,payload);
			} catch {socket.disconnect(true);}
		}
	}

	private handleConnection(socket: Socket) {
		const requestedRoom = this.getRequestedRoom(socket);

		if (requestedRoom) {
			void socket.join(requestedRoom);
		}

		socket.on('attendants:join', () => {
			socket.join(ATTENDANTS_ROOM);
		});

		socket.on('attendants:leave', () => {
			socket.leave(ATTENDANTS_ROOM);
		});

		socket.on('join:room', room => {
			if (typeof room === 'string' && availableRooms.has(room)) {
				void socket.join(room);
			}
		});
	}

	async close() {
		sessionEvents.off('revoked',this.revoke);
		this.unsubscribeOrderChanged();

		await new Promise<void>(resolve => {
			this.io.close(() => resolve());
		});
	}

	private getRequestedRoom(socket: Socket) {
		const authRoom = socket.handshake.auth.room;
		const authConnectionName = socket.handshake.auth.connectionName;
		const queryRoom = socket.handshake.query.room;
		const room =
			typeof authConnectionName === 'string'
				? authConnectionName
				: typeof authRoom === 'string'
					? authRoom
					: typeof queryRoom === 'string'
						? queryRoom
						: null;

		return room && availableRooms.has(room) ? room : null;
	}
}
