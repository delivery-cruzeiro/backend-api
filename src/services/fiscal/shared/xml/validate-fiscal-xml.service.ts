import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { access, mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

export class FiscalXmlValidationError extends Error {}

export async function validateFiscalXml(xml: string, schema: 'nfe' | 'procNFe') {
	const directory = process.env.FISCAL_XSD_DIR;
	if (!directory) throw new Error('Pacote oficial de schemas fiscais não configurado.');
	const schemaPath = join(directory, 'nfe_v4.00.xsd');
	if (schema === 'nfe') {
		await access(schemaPath);
		return validateAgainst(xml, schemaPath);
	}
	// Recent official releases ship the type TNfeProc without a separate root schema.
	const layout = join(directory, 'leiauteNFe_v4.00.xsd');
	await access(layout);
	const temp = await mkdtemp(join(tmpdir(), 'fiscal-xsd-'));
	const wrapper = join(temp, 'procNFe.xsd');
	try {
		const location = pathToFileURL(layout)
			.href.replaceAll('&', '&amp;')
			.replaceAll('"', '&quot;');
		await writeFile(
			wrapper,
			`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
			xmlns="http://www.portalfiscal.inf.br/nfe" targetNamespace="http://www.portalfiscal.inf.br/nfe" elementFormDefault="qualified">
			<xs:include schemaLocation="${location}"/><xs:element name="nfeProc" type="TNfeProc"/></xs:schema>`
		);
		await validateAgainst(xml, wrapper);
	} finally {
		await unlink(wrapper).catch(() => undefined);
		await rmdir(temp);
	}
}

async function validateAgainst(xml: string, schemaPath: string) {
	await new Promise<void>((resolve, reject) => {
		const child = spawn('xmllint', ['--nonet', '--noout', '--schema', schemaPath, '-'], {
			stdio: ['pipe', 'ignore', 'pipe'],
			windowsHide: true,
			timeout: 5000,
		});
		let diagnostics = '';
		child.stderr.setEncoding('utf8').on('data', chunk => {
			diagnostics = (diagnostics + chunk).slice(0, 8192);
		});
		child.on('error', () => reject(new Error('Validador fiscal indisponível.')));
		child.on('close', code => {
			if (code === 0) return resolve();
			if (code !== 3 && code !== 4) {
				return reject(new Error('Validador ou pacote de schemas fiscais indisponível.'));
			}
			const fields = [
				...new Set(
					Array.from(
						diagnostics.matchAll(
							/element ['"]?(?:\{[^}]+\})?([A-Za-z][A-Za-z0-9_]*)['"]?:/gi
						),
						match => match[1]
					)
				),
			];
			reject(
				new FiscalXmlValidationError(
					fields.length
						? `XML fiscal inválido no XSD (${fields.join(', ')}).`
						: 'XML fiscal recusado pelo XSD.'
				)
			);
		});
		child.stdin.on('error', () => reject(new Error('Falha ao validar o XML fiscal.')));
		child.stdin.end(xml);
	});
}
