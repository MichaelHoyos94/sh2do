import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from './AuthProvider';
import { ResendVerification } from './ResendVerification';

export function VerifyEmailBanner() {
  const { user } = useAuth();
  const [wasUnverified, setWasUnverified] = useState(false);
  if (user && !user.emailVerified && !wasUnverified) setWasUnverified(true);

  if (!user || user.emailVerified) {
    // Si el reenvío descubre que el correo ya estaba verificado, se confirma en vez de desaparecer en silencio.
    return wasUnverified ? (
      <Alert variant="success" role="status">
        Tu correo ya está verificado.
      </Alert>
    ) : null;
  }

  return (
    <Alert variant="warning" className="space-y-2" role="region" aria-labelledby="verify-email-title">
      <p id="verify-email-title" className="font-semibold">
        Verifica tu correo
      </p>
      <p>Te enviamos un enlace a {user.email}. Hasta que lo verifiques no podrás confirmar tu asistencia a planes.</p>
      <ResendVerification />
    </Alert>
  );
}
