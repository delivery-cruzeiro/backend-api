import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export enum UserRole {
	CLIENT = 'CLIENT',
	ADMIN = 'ADMIN',
	MANAGER = 'MANAGER',
	SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum UserGender {
	FEMALE = 'FEMALE',
	MALE = 'MALE',
	NON_BINARY = 'NON_BINARY',
	OTHER = 'OTHER',
	PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

export enum OrderStatus {
	PENDING = 'PENDING',
	CONFIRMED = 'CONFIRMED',
	PREPARING = 'PREPARING',
	ON_THE_WAY = 'ON_THE_WAY',
	DELIVERED = 'DELIVERED',
	CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
	PENDING = 'PENDING',
	PROCESSING = 'PROCESSING',
	COMPLETED = 'COMPLETED',
	FAILED = 'FAILED',
	REFUNDED = 'REFUNDED',
}

export enum PromotionType {
	PERCENTAGE = 'PERCENTAGE',
	FIXED_AMOUNT = 'FIXED_AMOUNT',
	BUY_X_GET_Y = 'BUY_X_GET_Y',
}

export enum PaymentType {
	CREDIT_CARD = 'CREDIT_CARD',
	DEBIT_CARD = 'DEBIT_CARD',
	PIX = 'PIX',
	CASH = 'CASH',
}

export enum PaymentCardType {
	CREDIT = 'CREDIT',
	DEBIT = 'DEBIT',
}

export enum NotificationType {
	ORDER_CONFIRMED = 'ORDER_CONFIRMED',
	ORDER_PREPARING = 'ORDER_PREPARING',
	ORDER_ON_THE_WAY = 'ORDER_ON_THE_WAY',
	ORDER_DELIVERED = 'ORDER_DELIVERED',
	ORDER_CANCELLED = 'ORDER_CANCELLED',
	PROMOTION = 'PROMOTION',
	SYSTEM = 'SYSTEM',
}

export enum PointType {
	EARNED = 'EARNED',
	REDEEMED = 'REDEEMED',
}

export const themeNames = ['default', 'cruzeiro'] as const;
export type ThemeName = (typeof themeNames)[number];

export type DeliveryModuleKey =
	| 'admin'
	| 'attendance'
	| 'crm'
	| 'delivery'
	| 'fiscal'
	| 'pdv'
	| 'promotions';

export interface BrandAssetConfig {
	faviconUrl?: string;
	logoAlt: string;
	logoUrl?: string;
}

export interface BrandThemeConfig {
	name: ThemeName;
	tokens: Record<string, string>;
}

export interface BrandI18nConfig {
	defaultLocale: 'pt-BR' | 'en';
	overrides: Record<string, Record<string, string>>;
}

export interface AppBrandConfig {
	assets: BrandAssetConfig;
	brandName: string;
	companyName: string;
	i18n: BrandI18nConfig;
	modules: Record<DeliveryModuleKey, boolean>;
	publicName: string;
	theme: BrandThemeConfig;
}

// ============================================================================
// SHARED SCHEMAS
// ============================================================================

const cuidSchema = z.string().min(1);
const moneySchema = z.number().nonnegative();
const optionalTextSchema = z.string().trim().min(1).optional();
const storeIdsSchema = z.array(cuidSchema).min(1);

export const themeNameSchema = z.enum(themeNames);

export const registerUserSchema = z.object({
	email: z.email(),
	password: z.string().min(8),
	name: z.string().trim().min(1),
	phone: optionalTextSchema,
});

export const loginUserSchema = z.object({
	email: z.email(),
	password: z.string().min(1),
});

export const createUserSchema = registerUserSchema
	.extend({
		role: z.enum(UserRole).optional().default(UserRole.CLIENT),
		storeIds: storeIdsSchema.optional(),
	})
	.superRefine((user, context) => {
		const storeIds = user.storeIds ?? [];

		if (user.role === UserRole.CLIENT && storeIds.length > 0) {
			context.addIssue({
				code: 'custom',
				message: 'clients cannot have stores',
				path: ['storeIds'],
			});
		}

		if (user.role !== UserRole.CLIENT && storeIds.length === 0) {
			context.addIssue({
				code: 'custom',
				message: 'storeIds is required for non-client users',
				path: ['storeIds'],
			});
		}
	});

export const updateUserSchema = z.object({
	email: z.email().optional(),
	name: optionalTextSchema,
	gender: z.enum(UserGender).nullable().optional(),
	phone: optionalTextSchema,
	avatar: z.url().nullable().optional(),
	role: z.enum(UserRole).optional(),
	isActive: z.boolean().optional(),
	storeIds: storeIdsSchema.optional(),
});

export const createAddressSchema = z.object({
	street: z.string().trim().min(1),
	number: z.string().trim().min(1),
	complement: optionalTextSchema,
	neighborhood: z.string().trim().min(1),
	city: z.string().trim().min(1),
	state: z.string().trim().min(2).max(2),
	zipCode: z.string().trim().min(8),
	latitude: z.number().optional(),
	longitude: z.number().optional(),
	isDefault: z.boolean().optional(),
});

export const updateAddressSchema = createAddressSchema.partial();

export const createStoreBusinessHourSchema = z.object({
	weekDay: z.number().int().min(0).max(6).nullable().optional(),
	date: z.coerce.date().nullable().optional(),
	openTime: optionalTextSchema.nullable(),
	closeTime: optionalTextSchema.nullable(),
	isClosed: z.boolean().optional(),
});

export const createStoreSchema = z.object({
	name: z.string().trim().min(1),
	nickname: z.string().trim().min(1),
	isActive: z.boolean().optional(),
	phoneNumber: optionalTextSchema.nullable(),
	openHour: optionalTextSchema.nullable(),
	closeHour: optionalTextSchema.nullable(),
	weekDaysOpen: z.array(z.number().int().min(0).max(6)).nullable().optional(),
	addressId: cuidSchema,
	ownerId: cuidSchema,
	cnpj: optionalTextSchema.nullable(),
	businessHours: z.array(createStoreBusinessHourSchema).optional(),
});

export const updateStoreSchema = createStoreSchema.partial();

export const createCategorySchema = z.object({
	name: z.string().trim().min(1),
	description: optionalTextSchema,
	imageUrl: z.url().optional(),
	order: z.number().int().nonnegative().optional(),
	isActive: z.boolean().optional(),
	storeIds: storeIdsSchema,
});

export const updateCategorySchema = createCategorySchema.partial();

export const createSubcategorySchema = createCategorySchema.extend({
	categoryId: cuidSchema,
});

export const updateSubcategorySchema = createSubcategorySchema.partial();

export const createMenuSchema = createCategorySchema.extend({
	categoryIds: z.array(cuidSchema).optional(),
	subcategoryIds: z.array(cuidSchema).optional(),
});

export const updateMenuSchema = createMenuSchema.partial();

export const createProductSchema = z.object({
	categoryId: cuidSchema,
	subcategoryId: cuidSchema.nullable().optional(),
	name: z.string().trim().min(1),
	description: z.string().trim().min(1),
	price: moneySchema,
	imageUrl: z.url().optional(),
	isActive: z.boolean().optional(),
	order: z.number().int().nonnegative().optional(),
	storeIds: storeIdsSchema,
});

export const updateProductSchema = createProductSchema.partial();

export const cartItemSchema = z.object({
	productId: cuidSchema,
	productName: z.string().trim().min(1),
	productPrice: moneySchema,
	quantity: z.number().int().positive(),
	imageUrl: z.url().optional(),
	notes: optionalTextSchema,
});

export const cartSchema = z.object({
	items: z.array(cartItemSchema),
	subtotal: moneySchema,
	deliveryFee: moneySchema,
	discount: moneySchema,
	total: moneySchema,
});

export const createOrderItemSchema = z.object({
	productId: cuidSchema,
	quantity: z.number().int().positive(),
	notes: optionalTextSchema,
});

export const createOrderSchema = z.object({
	userId: cuidSchema.optional(),
	addressId: cuidSchema.optional().nullable(),
	paymentMethodId: cuidSchema.optional(),
	storeId: cuidSchema,
	items: z.array(createOrderItemSchema).min(1),
	notes: optionalTextSchema,
});

export const updateOrderStatusSchema = z.object({
	status: z.enum(OrderStatus),
});

export const listAdminOrdersQuerySchema = z.object({
	status: z.union([z.enum(OrderStatus), z.literal('ALL')]).optional(),
	storeId: cuidSchema.optional(),
});

export const updateAdminOrderStatusSchema = updateOrderStatusSchema;

export const createPaymentMethodSchema = z.object({
	userId: cuidSchema,
	type: z.enum(PaymentType),
	cardType: z.enum(PaymentCardType).nullable().optional(),
	provider: z.string().trim().min(1),
	providerId: z.string().trim().min(1),
	last4: z.string().length(4).optional(),
	expiryMonth: z.number().int().min(1).max(12).optional(),
	expiryYear: z.number().int().min(2024).optional(),
	cardHolder: optionalTextSchema,
	isDefault: z.boolean().optional(),
});

export const updateClientProfileSchema = z.object({
	name: z.string().trim().min(1),
	gender: z.enum(UserGender).nullable().optional(),
	phone: optionalTextSchema.nullable(),
	avatar: z.url().nullable().optional(),
});

export const createClientAddressSchema = createAddressSchema;
export const updateClientAddressSchema = createClientAddressSchema.partial();

export const createClientPaymentMethodSchema = z.object({
	cardType: z.enum(PaymentCardType),
	provider: z.string().trim().min(1),
	providerId: z.string().trim().min(1),
	last4: z.string().length(4).optional(),
	expiryMonth: z.number().int().min(1).max(12).optional(),
	expiryYear: z.number().int().min(2024).optional(),
	cardHolder: optionalTextSchema,
	isDefault: z.boolean().optional(),
});

export const createClientOrderSchema = z.object({
	addressId: cuidSchema.nullable().optional(),
	paymentMethodId: cuidSchema.optional(),
	paymentType: z.enum(PaymentType),
	storeId: cuidSchema,
	items: z.array(createOrderItemSchema).min(1),
	notes: optionalTextSchema,
});

export const listClientOrdersQuerySchema = z.object({
	status: z.union([z.enum(OrderStatus), z.literal('ALL')]).optional(),
	storeId: z.union([cuidSchema, z.literal('ALL')]).optional(),
});

export const createPromotionSchema = z
	.object({
		name: z.string().trim().min(1),
		description: optionalTextSchema.nullable(),
		type: z.enum(PromotionType),
		value: z.number().nonnegative(),
		minPurchase: moneySchema.nullable().optional(),
		maxDiscount: moneySchema.nullable().optional(),
		startDate: z.coerce.date(),
		endDate: z.coerce.date(),
		isActive: z.boolean().optional(),
		buyProductId: cuidSchema.optional(),
		rewardProductId: cuidSchema.optional(),
		productIds: z.array(cuidSchema).optional(),
		storeIds: storeIdsSchema,
	})
	.superRefine((promotion, context) => {
		if (promotion.endDate <= promotion.startDate) {
			context.addIssue({
				code: 'custom',
				message: 'endDate must be after startDate',
				path: ['endDate'],
			});
		}

		if (promotion.type === PromotionType.BUY_X_GET_Y) {
			if (!promotion.buyProductId) {
				context.addIssue({
					code: 'custom',
					message: 'buyProductId is required',
					path: ['buyProductId'],
				});
			}

			if (!promotion.rewardProductId) {
				context.addIssue({
					code: 'custom',
					message: 'rewardProductId is required',
					path: ['rewardProductId'],
				});
			}

			return;
		}

		if (promotion.type === PromotionType.PERCENTAGE && promotion.value > 100) {
			context.addIssue({
				code: 'custom',
				message: 'percentage value must be at most 100',
				path: ['value'],
			});
		}

		if (promotion.value <= 0) {
			context.addIssue({
				code: 'custom',
				message: 'value must be positive',
				path: ['value'],
			});
		}
	});

export const updateSystemSettingsSchema = z.object({
	storeName: optionalTextSchema,
	storeOpen: z.boolean().optional(),
	autoApproveOrders: z.boolean().optional(),
	minOrderValue: moneySchema.optional(),
	freeDeliveryMin: moneySchema.optional(),
	pointsEnabled: z.boolean().optional(),
	pointsPerReal: z.number().int().positive().optional(),
});

export const createCupPollGuessSchema = z.object({
	brScore: z.number().int().min(0).max(99),
	instagramHandle: z
		.string()
		.trim()
		.regex(/^@[A-Za-z0-9._-]{1,30}$/, 'instagramHandle must start with @'),
	scScore: z.number().int().min(0).max(99),
});

// ============================================================================
// DTO TYPES INFERRED FROM ZOD
// ============================================================================

export type RegisterUserDTO = z.infer<typeof registerUserSchema>;
export type LoginUserDTO = z.infer<typeof loginUserSchema>;
export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
export type AddressDTO = z.infer<typeof createAddressSchema>;
export type UpdateAddressDTO = z.infer<typeof updateAddressSchema>;
export type StoreDTO = z.infer<typeof createStoreSchema>;
export type UpdateStoreDTO = z.infer<typeof updateStoreSchema>;
export type StoreBusinessHourDTO = z.infer<typeof createStoreBusinessHourSchema>;
export type CategoryDTO = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDTO = z.infer<typeof updateCategorySchema>;
export type MenuDTO = z.infer<typeof createMenuSchema>;
export type UpdateMenuDTO = z.infer<typeof updateMenuSchema>;
export type SubcategoryDTO = z.infer<typeof createSubcategorySchema>;
export type UpdateSubcategoryDTO = z.infer<typeof updateSubcategorySchema>;
export type ProductDTO = z.infer<typeof createProductSchema>;
export type UpdateProductDTO = z.infer<typeof updateProductSchema>;
export type CartItem = z.infer<typeof cartItemSchema>;
export type Cart = z.infer<typeof cartSchema>;
export type CreateOrderDTO = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusDTO = z.infer<typeof updateOrderStatusSchema>;
export type ListAdminOrdersQueryDTO = z.infer<typeof listAdminOrdersQuerySchema>;
export type ListClientOrdersQueryDTO = z.infer<typeof listClientOrdersQuerySchema>;
export type UpdateAdminOrderStatusDTO = z.infer<typeof updateAdminOrderStatusSchema>;
export type CreatePaymentMethodDTO = z.infer<typeof createPaymentMethodSchema>;
export type UpdateClientProfileDTO = z.infer<typeof updateClientProfileSchema>;
export type ClientAddressDTO = z.infer<typeof createClientAddressSchema>;
export type UpdateClientAddressDTO = z.infer<typeof updateClientAddressSchema>;
export type ClientPaymentMethodDTO = z.infer<typeof createClientPaymentMethodSchema>;
export type ClientOrderDTO = z.infer<typeof createClientOrderSchema>;
export type PromotionDTO = z.infer<typeof createPromotionSchema>;
export type UpdateSystemSettingsDTO = z.infer<typeof updateSystemSettingsSchema>;
export type CreateCupPollGuessDTO = z.infer<typeof createCupPollGuessSchema>;

// ============================================================================
// ENTITY TYPES
// ============================================================================

export interface User {
	id: string;
	email: string;
	name: string;
	gender?: UserGender | null;
	phone?: string;
	avatar?: string;
	role: UserRole;
	isActive: boolean;
	emailVerified: boolean;
	stores?: StoreSummary[];
	createdAt: Date;
	updatedAt: Date;
}

export interface UserWithSensitive extends User {
	password?: string;
}

export interface Address extends AddressDTO {
	id: string;
	userId: string;
	isDefault: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface StoreSummary {
	id: string;
	name: string;
	nickname: string;
	isActive: boolean;
	isClosed?: boolean;
}

export interface StoreBusinessHour {
	id: string;
	storeId: string;
	weekDay?: number | null;
	date?: Date | null;
	openTime?: Date | null;
	closeTime?: Date | null;
	isClosed: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface Store extends Omit<StoreDTO, 'businessHours'> {
	id: string;
	isActive: boolean;
	isClosed?: boolean;
	address?: Address;
	owner?: User;
	businessHours?: StoreBusinessHour[];
	createdAt: Date;
	updatedAt: Date;
}

export interface Category extends Omit<CategoryDTO, 'storeIds'> {
	id: string;
	stores?: StoreSummary[];
	order: number;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface Subcategory extends Omit<SubcategoryDTO, 'categoryId' | 'storeIds'> {
	id: string;
	categoryId: string;
	category?: Category;
	stores?: StoreSummary[];
	order: number;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface Menu extends Omit<MenuDTO, 'categoryIds' | 'storeIds' | 'subcategoryIds'> {
	id: string;
	categories: Category[];
	subcategories: Subcategory[];
	stores?: StoreSummary[];
	order: number;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface Product extends Omit<ProductDTO, 'storeIds'> {
	id: string;
	stores?: StoreSummary[];
	order: number;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface OrderItem {
	id: string;
	orderId: string;
	productId: string;
	price: number;
	quantity: number;
	notes?: string;
}

export interface Order {
	id: string;
	userId?: string;
	addressId?: string | null;
	address?: Address;
	storeId: string;
	store?: StoreSummary;
	paymentMethodId?: string;
	status: OrderStatus;
	items: OrderItem[];
	subtotal: number;
	deliveryFee: number;
	discount: number;
	total: number;
	notes?: string;
	estimatedDelivery?: Date;
	deliveredAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface AdminOrderCustomer {
	id: string;
	email: string;
	name: string;
	phone?: string | null;
}

export interface AdminOrderProductSummary {
	id: string;
	name: string;
	imageUrl?: string | null;
}

export interface AdminOrderAddress {
	id: string;
	userId: string;
	street: string;
	number: string;
	complement?: string | null;
	neighborhood: string;
	city: string;
	state: string;
	zipCode: string;
	latitude?: number | null;
	longitude?: number | null;
	isDefault: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface AdminOrderPaymentMethod {
	id: string;
	type: PaymentType;
	cardType?: PaymentCardType | null;
	provider: string;
	last4?: string | null;
	cardHolder?: string | null;
}

export interface AdminOrderItem {
	id: string;
	orderId: string;
	productId: string;
	product: AdminOrderProductSummary;
	price: number;
	quantity: number;
	notes?: string | null;
}

export interface AdminOrder {
	id: string;
	userId?: string | null;
	user?: AdminOrderCustomer | null;
	addressId?: string | null;
	address?: AdminOrderAddress | null;
	storeId?: string | null;
	store?: StoreSummary | null;
	paymentMethodId?: string | null;
	paymentMethod?: AdminOrderPaymentMethod | null;
	status: OrderStatus;
	items: AdminOrderItem[];
	subtotal: number;
	deliveryFee: number;
	discount: number;
	total: number;
	notes?: string | null;
	estimatedDelivery?: Date | null;
	deliveredAt?: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface PaymentMethod extends CreatePaymentMethodDTO {
	id: string;
	cardType?: PaymentCardType | null;
	isDefault: boolean;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface Payment {
	id: string;
	orderId: string;
	paymentMethodId: string;
	amount: number;
	status: PaymentStatus;
	provider: string;
	providerTxId?: string;
	providerResponse?: Record<string, unknown>;
	paidAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface Promotion extends Omit<PromotionDTO, 'productIds' | 'storeIds'> {
	id: string;
	isActive: boolean;
	products?: Product[];
	stores?: StoreSummary[];
	createdAt: Date;
	updatedAt: Date;
}

export interface SystemSettings {
	id: string;
	storeName: string;
	storeOpen: boolean;
	autoApproveOrders: boolean;
	minOrderValue: number;
	freeDeliveryMin?: number;
	pointsEnabled: boolean;
	pointsPerReal: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface DeliveryZone {
	id: string;
	name: string;
	neighborhood: string;
	city: string;
	state: string;
	zipCode?: string;
	fee: number;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface Notification {
	id: string;
	userId: string;
	type: NotificationType;
	title: string;
	message: string;
	isRead: boolean;
	createdAt: Date;
}

export interface Review {
	id: string;
	userId: string;
	productId: string;
	rating: number;
	comment?: string;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface ReviewDTO {
	productId: string;
	rating: number;
	comment?: string;
}

export interface Favorite {
	id: string;
	userId: string;
	productId: string;
	createdAt: Date;
}

export interface Point {
	id: string;
	userId: string;
	amount: number;
	type: PointType;
	description?: string;
	orderId?: string;
	createdAt: Date;
}

export interface UserPoints {
	userId: string;
	balance: number;
	totalEarned: number;
	totalRedeemed: number;
}

export interface CupPollGuess {
	id: string;
	instagramHandle: string;
	score: string;
	createdAt: Date;
}

// ============================================================================
// API RESPONSE TYPES AND HELPERS
// ============================================================================

export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface ApiError {
	message: string;
	code?: string;
	statusCode?: number;
	details?: Record<string, unknown>;
}

export interface JwtPayload {
	userId: string;
	email: string;
	role: UserRole;
	iat?: number;
	exp?: number;
}

export interface AuthResponse {
	user: User;
	token: string;
	refreshToken?: string;
}

export function formatZodError(error: z.ZodError): ApiError {
	return {
		message: 'Validation error',
		code: 'VALIDATION_ERROR',
		statusCode: 400,
		details: error.flatten() as unknown as Record<string, unknown>,
	};
}

export function safeParseApiInput<TSchema extends z.ZodType>(
	schema: TSchema,
	input: unknown
): ApiResponse<z.infer<TSchema>> {
	const result = schema.safeParse(input);

	if (!result.success) {
		const error = formatZodError(result.error);

		return {
			success: false,
			error: error.message,
			data: undefined,
			message: error.code,
		};
	}

	return {
		success: true,
		data: result.data,
	};
}
