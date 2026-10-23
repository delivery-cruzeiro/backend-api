import { readFile } from 'node:fs/promises';

const repository = 'delivery-cruzeiro/Infra';
const components = [
	'backend-api',
	'web-shell',
	'admin-web',
	'auth-web',
	'delivery-web',
	'cup-pool',
	'pdv-web',
	'crm-web',
	'attendance-web',
] as const;
const versionPattern = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
type Component = (typeof components)[number];
export interface DeploymentRelease {
	version: string;
	title: string;
	createdAt: string;
	repositories: Record<Component, { ref: string; title: string }>;
}
export interface DeploymentCatalog {
	releases: DeploymentRelease[];
}
export class DeploymentError extends Error {
	constructor(
		public statusCode: number,
		message: string
	) {
		super(message);
	}
}

export function parseDeploymentCatalog(value: unknown): DeploymentCatalog {
	const catalog = value as DeploymentCatalog;
	if (!catalog || !Array.isArray(catalog.releases) || catalog.releases.length > 500)
		throw new DeploymentError(422, 'Catalogo de versoes invalido');
	const versions = new Set<string>();
	for (const release of catalog.releases) {
		if (
			!release ||
			!versionPattern.test(release.version) ||
			versions.has(release.version) ||
			typeof release.title !== 'string' ||
			!release.title.trim() ||
			release.title.length > 300 ||
			!Number.isFinite(Date.parse(release.createdAt))
		)
			throw new DeploymentError(422, 'Versao invalida no catalogo');
		versions.add(release.version);
		if (!release.repositories || Object.keys(release.repositories).length !== components.length)
			throw new DeploymentError(422, 'Componentes incompletos');
		for (const component of components) {
			const item = release.repositories[component];
			if (
				!item ||
				!/^[a-f0-9]{40}$/.test(item.ref) ||
				typeof item.title !== 'string' ||
				item.title.length > 300
			)
				throw new DeploymentError(422, 'Referencia de imagem invalida');
		}
	}
	return catalog;
}

export function renderReleaseDockerfile(template: string, release: DeploymentRelease): string {
	let result = template;
	for (const component of components) {
		if (!result.includes(`{{${component}}}`))
			throw new DeploymentError(422, 'Modelo de publicacao incompleto');
		result = result.replaceAll(`{{${component}}}`, release.repositories[component].ref);
	}
	result = result.replaceAll('{{version}}', release.version);
	if (/\{\{[^}]+\}\}/.test(result))
		throw new DeploymentError(422, 'Modelo de publicacao invalido');
	return result;
}

export class DeploymentReleaseService {
	private branch = process.env.DEPLOYMENT_GITHUB_BRANCH || 'codex/render-free-preview';
	private token = process.env.DEPLOYMENT_GITHUB_TOKEN;
	constructor(private request: typeof fetch = fetch) {}

	private async github<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
		if (!this.token)
			throw new DeploymentError(503, 'Publicacao ainda nao configurada no servidor');
		let response: Response;
		try {
			response = await this.request(`https://api.github.com/repos/${repository}/${path}`, {
				method,
				redirect: 'error',
				signal: AbortSignal.timeout(15000),
				headers: {
					Authorization: `Bearer ${this.token}`,
					Accept: 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28',
					'Content-Type': 'application/json',
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			});
		} catch {
			throw new DeploymentError(502, 'Nao foi possivel consultar a publicacao');
		}
		if (!response.ok) {
			if (response.status === 409 || response.status === 422)
				throw new DeploymentError(
					409,
					'A publicacao mudou. Atualize a pagina antes de tentar novamente'
				);
			throw new DeploymentError(
				502,
				'GitHub indisponivel ou credencial de publicacao sem permissao'
			);
		}
		return (await response.json()) as T;
	}

	private async file(path: string, ref: string): Promise<string> {
		const item = await this.github<{ content: string; size: number; encoding: string }>(
			`contents/${path}?ref=${encodeURIComponent(ref)}`
		);
		if (item.encoding !== 'base64' || item.size > 2_000_000)
			throw new DeploymentError(422, 'Arquivo de publicacao invalido');
		return Buffer.from(item.content, 'base64').toString('utf8');
	}

	async list() {
		let catalog: DeploymentCatalog;
		let selectedVersion: string | null = null;
		let revision: string | null = null;
		if (this.token) {
			const head = await this.github<{ object: { sha: string } }>(
				`git/ref/heads/${this.branch}`
			);
			revision = head.object.sha;
			const [source, selection] = await Promise.all([
				this.file('render/releases.json', revision),
				this.file('render/selected-release.json', revision),
			]);
			catalog = parseDeploymentCatalog(JSON.parse(source));
			selectedVersion = (JSON.parse(selection) as { version: string }).version;
		} else {
			try {
				catalog = parseDeploymentCatalog(
					JSON.parse(
						await readFile(
							process.env.DEPLOYMENT_CATALOG_PATH || '/app/render/releases.json',
							'utf8'
						)
					)
				);
			} catch {
				catalog = { releases: [] };
			}
		}
		return {
			...catalog,
			currentVersion: process.env.DEPLOYMENT_VERSION || null,
			selectedVersion,
			revision,
			canDeploy: Boolean(this.token),
		};
	}

	async select(version: string, revision: string, actorId: string) {
		if (!versionPattern.test(version) || !/^[a-f0-9]{40}$/.test(revision))
			throw new DeploymentError(400, 'Versao ou revisao invalida');
		const head = await this.github<{ object: { sha: string } }>(`git/ref/heads/${this.branch}`);
		if (head.object.sha !== revision)
			throw new DeploymentError(
				409,
				'A publicacao mudou. Atualize a pagina antes de tentar novamente'
			);
		const [catalogSource, template, manifestSource, selectedSource, parent] = await Promise.all(
			[
				this.file('render/releases.json', revision),
				this.file('render/Dockerfile.template', revision),
				this.file('releases.json', revision),
				this.file('render/selected-release.json', revision),
				this.github<{ tree: { sha: string } }>(`git/commits/${revision}`),
			]
		);
		const release = parseDeploymentCatalog(JSON.parse(catalogSource)).releases.find(
			item => item.version === version
		);
		if (!release) throw new DeploymentError(404, 'Versao nao encontrada');
		if ((JSON.parse(selectedSource) as { version: string }).version === version)
			throw new DeploymentError(409, 'Esta versao ja esta selecionada');
		const manifest = JSON.parse(manifestSource) as {
			version: string;
			repositories: Record<string, { url: string; ref: string }>;
		};
		manifest.version = version.slice(1);
		for (const component of components)
			manifest.repositories[component] = {
				url: `https://github.com/delivery-cruzeiro/${component}.git`,
				ref: release.repositories[component].ref,
			};
		const files = {
			'render/Dockerfile': renderReleaseDockerfile(template, release),
			'releases.json': JSON.stringify(manifest, null, 2) + '\n',
			'render/selected-release.json':
				JSON.stringify(
					{
						version,
						title: release.title,
						requestedBy: actorId,
						requestedAt: new Date().toISOString(),
					},
					null,
					2
				) + '\n',
		};
		const tree = await this.github<{ sha: string }>('git/trees', 'POST', {
			base_tree: parent.tree.sha,
			tree: Object.entries(files).map(([path, content]) => ({
				path,
				mode: '100644',
				type: 'blob',
				content,
			})),
		});
		const commit = await this.github<{ sha: string }>('git/commits', 'POST', {
			message: `deploy: select ${version} - ${release.title}`,
			tree: tree.sha,
			parents: [revision],
		});
		await this.github(`git/refs/heads/${this.branch}`, 'PATCH', {
			sha: commit.sha,
			force: false,
		});
		return { version, commit: commit.sha, status: 'requested' as const };
	}
}
