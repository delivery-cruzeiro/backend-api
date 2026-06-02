import type { AppBrandConfig, DeliveryModuleKey, ThemeName } from '@delivery-cruzeiro/types';

const moduleKeys = [
	'admin',
	'attendance',
	'crm',
	'delivery',
	'fiscal',
	'pdv',
	'promotions',
] as const satisfies DeliveryModuleKey[];

const defaultModules: Record<DeliveryModuleKey, boolean> = {
	admin: true,
	attendance: false,
	crm: false,
	delivery: true,
	fiscal: true,
	pdv: false,
	promotions: true,
};

function readBooleanEnv(name: string, fallback: boolean): boolean {
	const value = process.env[name];

	if (value === undefined) {
		return fallback;
	}

	return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function readThemeName(): ThemeName {
	const value = process.env.APP_THEME_NAME;

	return value === 'default' || value === 'cruzeiro' ? value : 'cruzeiro';
}

function readThemeTokens(): Record<string, string> {
	const rawTokens = process.env.APP_THEME_TOKENS_JSON;

	if (!rawTokens) {
		return {};
	}

	try {
		const tokens = JSON.parse(rawTokens) as Record<string, unknown>;

		return Object.fromEntries(
			Object.entries(tokens).filter((entry): entry is [string, string] => {
				const [name, value] = entry;

				return name.trim().length > 0 && typeof value === 'string';
			})
		);
	} catch {
		return {};
	}
}

export class AppConfigService {
	getPublicConfig(): AppBrandConfig {
		const modules = Object.fromEntries(
			moduleKeys.map(moduleKey => [
				moduleKey,
				readBooleanEnv(
					`APP_MODULE_${moduleKey.toUpperCase()}_ENABLED`,
					defaultModules[moduleKey]
				),
			])
		) as Record<DeliveryModuleKey, boolean>;

		return {
			assets: {
				faviconUrl: process.env.APP_FAVICON_URL,
				logoAlt: process.env.APP_LOGO_ALT ?? 'Cruzeiro Delivery',
				logoUrl: process.env.APP_LOGO_URL,
			},
			brandName: process.env.APP_BRAND_NAME ?? 'Cruzeiro Delivery',
			companyName: process.env.APP_COMPANY_NAME ?? 'Pastel do Cruzeiro',
			i18n: {
				defaultLocale: 'pt-BR',
				overrides: {},
			},
			modules,
			publicName: process.env.APP_PUBLIC_NAME ?? 'Cruzeiro Delivery',
			theme: {
				name: readThemeName(),
				tokens: readThemeTokens(),
			},
		};
	}
}
