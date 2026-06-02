import { EventEmitter } from 'node:events';
import { OrderStatus, type AdminOrder } from '@delivery-cruzeiro/types';

export const ADMIN_ORDERS_CHANGED_EVENT = 'admin-orders:changed';
export const ATTENDANTS_ROOM = 'attendants';

export type AdminOrderChangedAction = 'create' | 'update';

export interface AdminOrderChangedPayload {
	action: AdminOrderChangedAction;
	order: AdminOrder;
	status: OrderStatus;
}

export interface OrderChangeEventPublisher {
	emitOrderChanged(payload: AdminOrderChangedPayload): void;
}

type OrderChangedListener = (payload: AdminOrderChangedPayload) => void;

export class OrderEventsEmitter implements OrderChangeEventPublisher {
	private readonly emitter = new EventEmitter();

	emitOrderChanged(payload: AdminOrderChangedPayload) {
		this.emitter.emit(ADMIN_ORDERS_CHANGED_EVENT, payload);
	}

	onOrderChanged(listener: OrderChangedListener) {
		this.emitter.on(ADMIN_ORDERS_CHANGED_EVENT, listener);

		return () => {
			this.emitter.off(ADMIN_ORDERS_CHANGED_EVENT, listener);
		};
	}
}

export const orderEventsEmitter = new OrderEventsEmitter();
