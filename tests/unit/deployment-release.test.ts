import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import {
	DeploymentReleaseService,
	parseDeploymentCatalog,
	renderReleaseDockerfile,
} from '../../src/services/deployment-release.service.js';

const authentication = vi.hoisted(() => ({ role: 'SUPER_ADMIN' as string | null, active: true }));
vi.mock('../../src/lib/auth.js', () => ({
	auth: {
		api: {
			getSession: vi.fn(async () =>
				authentication.role ? { user: { id: 'admin-1' } } : null
			),
		},
	},
}));
vi.mock('../../src/lib/prisma.js', () => ({
	prisma: {
		user: {
			findUnique: vi.fn(async () => ({
				id: 'admin-1',
				role: authentication.role,
				isActive: authentication.active,
			})),
		},
	},
}));
import { deploymentReleaseRoutes } from '../../src/routes/deployment-release.routes.js';

const names = [
	'backend-api',
	'web-shell',
	'admin-web',
	'auth-web',
	'delivery-web',
	'cup-pool',
	'pdv-web',
	'crm-web',
	'attendance-web',
];
const release = {
	version: 'v1.0.1',
	title: 'feat: versions [skip render]',
	createdAt: '2026-10-23T16:00:00Z',
	repositories: Object.fromEntries(
		names.map(name => [name, { ref: 'b'.repeat(40), title: name }])
	),
};
const catalog = { releases: [release] };
const revision = 'a'.repeat(40);
const template =
	names.map(name => `FROM ghcr.io/delivery-cruzeiro/${name}:sha-{{${name}}}`).join('\n') +
	'\nENV DEPLOYMENT_VERSION={{version}}';
const encode = (source: unknown) => ({
	content: Buffer.from(typeof source === 'string' ? source : JSON.stringify(source)).toString(
		'base64'
	),
	encoding: 'base64',
	size: 100,
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

beforeEach(() => {
	vi.stubEnv('DEPLOYMENT_GITHUB_TOKEN', 'test-secret');
	authentication.role = 'SUPER_ADMIN';
	authentication.active = true;
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('deployment authorization', () => {
	it.each([null, 'CLIENT', 'MANAGER', 'ADMIN'])(
		'denies both endpoints to %s before reaching GitHub',
		async role => {
			authentication.role = role;
			const upstream = vi.spyOn(globalThis, 'fetch');
			const app = Fastify();
			await app.register(deploymentReleaseRoutes, { prefix: '/api' });
			for (const method of ['GET', 'POST'] as const) {
				const response = await app.inject({
					method,
					url: `/api/deployment/releases${method === 'POST' ? '/select' : ''}`,
					...(method === 'POST'
						? { payload: { version: release.version, revision } }
						: {}),
				});
				expect(response.statusCode).toBe(role ? 403 : 401);
			}
			expect(upstream).not.toHaveBeenCalled();
			await app.close();
		}
	);
	it('rejects a deactivated super administrator', async () => {
		authentication.active = false;
		const app = Fastify();
		await app.register(deploymentReleaseRoutes, { prefix: '/api' });
		expect((await app.inject('/api/deployment/releases')).statusCode).toBe(403);
		await app.close();
	});
	it('allows a server-verified super administrator to read the catalog without returning credentials', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
			if (String(url).includes('git/ref/heads/')) return json({ object: { sha: revision } });
			return json(
				encode(String(url).includes('selected-release') ? { version: 'v1.0.0' } : catalog)
			);
		});
		const app = Fastify();
		await app.register(deploymentReleaseRoutes, { prefix: '/api' });
		const response = await app.inject('/api/deployment/releases');
		expect(response.statusCode).toBe(200);
		expect(response.json().releases[0].title).toBe(release.title);
		expect(response.headers['cache-control']).toBe('no-store');
		expect(response.body).not.toContain('test-secret');
		await app.close();
	});
});

describe('immutable release selection', () => {
	it('updates Dockerfile, manifest and selection in one commit without force-pushing', async () => {
		const calls: { path: string; body: any }[] = [];
		const upstream = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
			const path = String(url);
			const body = init?.body ? JSON.parse(String(init.body)) : undefined;
			calls.push({ path, body });
			if (path.includes('git/ref/heads/')) return json({ object: { sha: revision } });
			if (path.includes('contents/render/releases.json')) return json(encode(catalog));
			if (path.includes('contents/render/Dockerfile.template')) return json(encode(template));
			if (path.includes('contents/render/selected-release.json'))
				return json(encode({ version: 'v1.0.0' }));
			if (path.includes('contents/releases.json'))
				return json(encode({ version: '1.0.0', repositories: {} }));
			if (path.endsWith(`git/commits/${revision}`))
				return json({ tree: { sha: 'tree-before' } });
			return json({ sha: path.endsWith('git/trees') ? 'tree-after' : 'new-commit' });
		});
		const result = await new DeploymentReleaseService(upstream).select(
			release.version,
			revision,
			'admin-1'
		);
		expect(result.status).toBe('requested');
		const tree = calls.find(item => item.path.endsWith('git/trees'))!.body;
		expect(tree.base_tree).toBe('tree-before');
		expect(tree.tree).toHaveLength(3);
		expect(tree.tree.find((file: any) => file.path === 'render/Dockerfile').content).toContain(
			'DEPLOYMENT_VERSION=v1.0.1'
		);
		expect(
			tree.tree.find((file: any) => file.path === 'render/selected-release.json').content
		).toContain('admin-1');
		expect(calls.at(-1)!.body).toEqual({ sha: 'new-commit', force: false });
		expect(calls.find(item => item.path.endsWith('git/commits'))!.body.message).toBe(
			'deploy: select v1.0.1'
		);
		expect(
			tree.tree.find((file: any) => file.path === 'render/selected-release.json').content
		).toContain('[skip render]');
		expect(calls.find(item => item.path.endsWith('git/commits'))!.body.parents).toEqual([
			revision,
		]);
	});
	it('rejects stale selections before writing files', async () => {
		const upstream = vi.fn(async () => json({ object: { sha: 'c'.repeat(40) } }));
		await expect(
			new DeploymentReleaseService(upstream).select(release.version, revision, 'admin-1')
		).rejects.toMatchObject({ statusCode: 409 });
		expect(upstream).toHaveBeenCalledTimes(1);
	});
	it('does not accept unregistered versions or mutable image tags', () => {
		expect(() =>
			parseDeploymentCatalog({
				releases: [
					{
						...release,
						repositories: {
							...release.repositories,
							'backend-api': { ref: 'latest', title: 'bad' },
						},
					},
				],
			})
		).toThrow();
		expect(() => parseDeploymentCatalog({ releases: [release, release] })).toThrow();
		expect(() =>
			renderReleaseDockerfile(
				'FROM arbitrary-image',
				parseDeploymentCatalog(catalog).releases[0]!
			)
		).toThrow();
	});
	it('does not leak provider bodies or credentials on failure', async () => {
		const upstream = vi.fn(
			async () => new Response('test-secret upstream diagnostics', { status: 403 })
		);
		await expect(new DeploymentReleaseService(upstream).list()).rejects.toMatchObject({
			statusCode: 502,
			message: 'GitHub indisponivel ou credencial de publicacao sem permissao',
		});
	});
});
