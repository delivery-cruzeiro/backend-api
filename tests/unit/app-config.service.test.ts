import { describe, expect, it, vi, afterEach } from 'vitest';
import { AppConfigService } from '../../src/services/app-config.service.js';

describe('AppConfigService', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('retorna a configuracao publica padrao do Cruzeiro Delivery', () => {
		const config = new AppConfigService().getPublicConfig();

		expect(config).toMatchObject({
			assets: {
				logoAlt: 'Cruzeiro Delivery',
			},
			brandName: 'Cruzeiro Delivery',
			companyName: 'Pastel do Cruzeiro',
			i18n: {
				defaultLocale: 'pt-BR',
				overrides: {},
			},
			modules: {
				admin: true,
				attendance: false,
				crm: false,
				delivery: true,
				fiscal: true,
				pdv: false,
				promotions: true,
			},
			publicName: 'Cruzeiro Delivery',
			theme: {
				name: 'cruzeiro',
				tokens: {},
			},
		});
	});

	it('permite sobrescrever marca, tema e modulos por env', () => {
		vi.stubEnv('APP_BRAND_NAME', 'Outra Marca');
		vi.stubEnv('APP_COMPANY_NAME', 'Outra Empresa');
		vi.stubEnv('APP_LOGO_ALT', 'Logo da outra marca');
		vi.stubEnv('APP_MODULE_CRM_ENABLED', 'true');
		vi.stubEnv('APP_MODULE_FISCAL_ENABLED', 'false');
		vi.stubEnv('APP_PUBLIC_NAME', 'Outro Delivery');
		vi.stubEnv('APP_THEME_NAME', 'default');
		vi.stubEnv('APP_THEME_TOKENS_JSON', '{"color-primary":"#123456"}');

		const config = new AppConfigService().getPublicConfig();

		expect(config.brandName).toBe('Outra Marca');
		expect(config.companyName).toBe('Outra Empresa');
		expect(config.publicName).toBe('Outro Delivery');
		expect(config.assets.logoAlt).toBe('Logo da outra marca');
		expect(config.modules.crm).toBe(true);
		expect(config.modules.fiscal).toBe(false);
		expect(config.theme).toEqual({
			name: 'default',
			tokens: {
				'color-primary': '#123456',
			},
		});
	});
});
