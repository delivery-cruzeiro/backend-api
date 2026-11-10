import { expect, it } from 'vitest';
import { emailConfirmationEmail } from '../../src/services/email-confirmation-email.js';

it('uses a clickable label in HTML and keeps a plain-text fallback', () => {
	const url = new URL('https://example.com/register/confirm-email#code=abc123');
	const message = emailConfirmationEmail('Pastel do Cruzeiro', url);

	expect(message.html).toContain(
		`Para confirmar o e-mail da sua conta em Pastel do Cruzeiro, <a href="${url.href}">Clique aqui!</a>`
	);
	expect(message.text).toContain(url.href);
});

it('escapes the company name and URL before embedding them in HTML', () => {
	const url = new URL('https://example.com/register/confirm-email?source=email&lang=pt#code=abc123');
	const message = emailConfirmationEmail('Pastel & <Cruzeiro>', url);

	expect(message.html).toContain('Pastel &amp; &lt;Cruzeiro&gt;');
	expect(message.html).toContain('source=email&amp;lang=pt#code=abc123');
	expect(message.html).not.toContain('<Cruzeiro>');
});
