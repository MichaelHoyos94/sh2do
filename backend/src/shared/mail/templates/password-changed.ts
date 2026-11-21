import type { MailMessage } from '../mailer.js';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Aviso sin enlaces: no hay nada que un atacante pueda reutilizar. */
export function passwordChangedTemplate(params: { displayName: string }): Omit<MailMessage, 'to'> {
  const name = params.displayName || 'hola';
  const text =
    'La contraseña de tu cuenta de Sh2do acaba de cambiar y cerramos todas tus sesiones. Si fuiste tú, no tienes que hacer nada. Si no fuiste tú, restablece tu contraseña desde la página de inicio de sesión de inmediato.';
  return {
    subject: 'Tu contraseña de Sh2do cambió',
    text: [`Hola, ${name}.`, '', text].join('\n'),
    html: `<p>Hola, ${escapeHtml(name)}.</p>\n<p>${text}</p>`,
  };
}
