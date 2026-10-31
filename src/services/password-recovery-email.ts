export function passwordRecoveryEmail(companyName: string, code: string) {
	return {
		subject: `Recupere sua senha — ${companyName}`,
		text: `Olá!

Recebemos uma solicitação para redefinir a senha da sua conta em ${companyName}.

Seu código de recuperação é:

${code}

Volte à página de recuperação e informe esses seis dígitos para cadastrar uma nova senha.

O código é válido por 30 minutos e pode ser utilizado apenas uma vez. Se você solicitar outro código, este será invalidado imediatamente.

Se você não solicitou a recuperação, ignore este email. Sua senha permanecerá a mesma. Não compartilhe este código com ninguém.

Equipe ${companyName}`,
	};
}
