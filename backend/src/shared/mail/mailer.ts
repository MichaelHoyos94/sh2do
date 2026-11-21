import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Lo mínimo que necesita el worker; permite inyectar un transporte falso en las pruebas. */
export interface MailTransport {
  sendMail(message: MailMessage & { from: string }): Promise<{ messageId: string }>;
}

export const createSmtpTransport = (): MailTransport =>
  nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
