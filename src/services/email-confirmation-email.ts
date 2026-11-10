function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

export function emailConfirmationEmail(company: string, url: URL) {
	const instructions = `Para confirmar o e-mail da sua conta em ${company},`;
	const expiry = 'O link é válido por 24 horas. Se você não criou esta conta, ignore a mensagem.';
	const signature = `Equipe ${company}`;

	return {
		subject: `Confirme seu e-mail — ${company}`,
		text: `Olá!\n\n${instructions} acesse este link:\n${url}\n\n${expiry}\n\n${signature}`,
		html: `<p>Olá!</p>
<p>${escapeHtml(instructions)} <a href="${escapeHtml(url.href)}">Clique aqui!</a></p>
<p>${expiry}</p>
<p>${escapeHtml(signature)}</p>`,
	};
}
