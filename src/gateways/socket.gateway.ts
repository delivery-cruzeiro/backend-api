import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
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

	constructor({ corsOrigin, eventEmitter, httpServer }: SocketGatewayOptions) {
		this.io = new Server(httpServer, {
			cors: {
				credentials: true,
				origin: corsOrigin,
			},
		});

		this.io.on('connection', socket => this.handleConnection(socket));
		this.unsubscribeOrderChanged = eventEmitter.onOrderChanged(payload => {
			this.io.to(ATTENDANTS_ROOM).emit(ADMIN_ORDERS_CHANGED_EVENT, payload);
		});
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
