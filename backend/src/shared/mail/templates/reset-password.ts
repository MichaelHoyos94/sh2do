import type { MailMessage } from '../mailer.js';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function resetPasswordTemplate(params: {
  displayName: string;
  url: string;
}): Omit<MailMessage, 'to'> {
  const name = params.displayName || 'hola';
  return {
    subject: 'Restablece tu contraseña de Sh2do',
    text: [
      `Hola, ${name}.`,
      '',
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta de Sh2do. Crea una nueva desde este enlace:',
      params.url,
      '',
      'El enlace vence en 24 horas y solo se puede usar una vez. Si no lo pediste, ignora este mensaje: tu contraseña sigue igual.',
    ].join('\n'),
    html: `<p>Hola, ${escapeHtml(name)}.</p>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de Sh2do. Crea una nueva desde este enlace:</p>
<p><a href="${escapeHtml(params.url)}">Restablecer mi contraseña</a></p>
<p>El enlace vence en 24 horas y solo se puede usar una vez. Si no lo pediste, ignora este mensaje: tu contraseña sigue igual.</p>`,
  };
}
