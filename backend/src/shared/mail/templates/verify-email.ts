import type { MailMessage } from '../mailer.js';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function verifyEmailTemplate(params: {
  displayName: string;
  url: string;
}): Omit<MailMessage, 'to'> {
  const name = params.displayName || 'hola';
  return {
    subject: 'Verifica tu correo en Sh2do',
    text: [
      `Hola, ${name}.`,
      '',
      'Confirma tu correo para terminar de configurar tu cuenta de Sh2do:',
      params.url,
      '',
      'El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este mensaje.',
    ].join('\n'),
    html: `<p>Hola, ${escapeHtml(name)}.</p>
<p>Confirma tu correo para terminar de configurar tu cuenta de Sh2do:</p>
<p><a href="${escapeHtml(params.url)}">Verificar mi correo</a></p>
<p>El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este mensaje.</p>`,
  };
}
