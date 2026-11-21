import { execSync } from 'node:child_process';

// Migra la BD de pruebas una vez antes de todas las pruebas.
export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
  });
}
