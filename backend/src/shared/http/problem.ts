export type ProblemCode =
  | 'VALIDATION_ERROR'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'SESSION_INVALID'
  | 'VERIFICATION_TOKEN_INVALID'
  | 'VERIFICATION_TOKEN_EXPIRED'
  | 'EMAIL_ALREADY_VERIFIED'
  | 'EMAIL_NOT_VERIFIED'
  | 'PASSWORD_RESET_TOKEN_INVALID'
  | 'PASSWORD_RESET_TOKEN_EXPIRED'
  | 'TOO_MANY_REQUESTS'
  | 'NOT_FOUND'
  | 'TAG_NAME_TAKEN'
  | 'INTERNAL_ERROR';

const DEFAULTS: Record<ProblemCode, { status: number; title: string }> = {
  VALIDATION_ERROR: { status: 422, title: 'Datos inválidos' },
  EMAIL_ALREADY_REGISTERED: { status: 409, title: 'Correo ya registrado' },
  INVALID_CREDENTIALS: { status: 401, title: 'Credenciales incorrectas' },
  UNAUTHENTICATED: { status: 401, title: 'No autenticado' },
  SESSION_INVALID: { status: 401, title: 'Sesión no válida' },
  VERIFICATION_TOKEN_INVALID: { status: 400, title: 'Enlace de verificación no válido' },
  VERIFICATION_TOKEN_EXPIRED: { status: 400, title: 'Enlace de verificación vencido' },
  EMAIL_ALREADY_VERIFIED: { status: 409, title: 'Correo ya verificado' },
  EMAIL_NOT_VERIFIED: { status: 403, title: 'Correo sin verificar' },
  PASSWORD_RESET_TOKEN_INVALID: { status: 400, title: 'Enlace de recuperación no válido' },
  PASSWORD_RESET_TOKEN_EXPIRED: { status: 400, title: 'Enlace vencido' },
  TOO_MANY_REQUESTS: { status: 429, title: 'Demasiados intentos' },
  NOT_FOUND: { status: 404, title: 'No encontrado' },
  TAG_NAME_TAKEN: { status: 409, title: 'Etiqueta repetida' },
  INTERNAL_ERROR: { status: 500, title: 'Error interno' },
};

export interface FieldError {
  field: string;
  message: string;
}

/** Error de negocio o de HTTP que el error handler traduce a Problem Details (RFC 9457). */
export class AppError extends Error {
  readonly status: number;
  readonly title: string;

  constructor(
    readonly code: ProblemCode,
    detail: string,
    readonly options: { status?: number; errors?: FieldError[]; retryAfter?: number } = {},
  ) {
    super(detail);
    this.status = options.status ?? DEFAULTS[code].status;
    this.title = DEFAULTS[code].title;
  }

  toProblem() {
    return {
      type: `https://sh2do.app/problems/${this.code.toLowerCase().replaceAll('_', '-')}`,
      title: this.title,
      status: this.status,
      detail: this.message,
      code: this.code,
      ...(this.options.errors && { errors: this.options.errors }),
    };
  }
}
