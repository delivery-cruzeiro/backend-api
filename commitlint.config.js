export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		'type-enum': [
			2,
			'always',
			[
				'feat', // Novo recurso
				'fix', // Correção de bug
				'docs', // Alteração na documentação
				'style', // Alterações de formatação (sem código)
				'refactor', // Refatoração de código
				'perf', // Melhoria de performance
				'test', // Adiciona ou modifica testes
				'build', // Alterações no build system ou dependências
				'ci', // Alterações na configuração de CI
				'chore', // Outras alterações que não modificam src ou test files
				'revert', // Reverte um commit anterior
			],
		],
		'scope-case': [2, 'always', 'kebab-case'],
		'subject-case': [0],
	},
};
