// Fuente única de "ahora" para que las pruebas puedan controlar el reloj (vi.spyOn(clock, 'now')).
export const clock = {
  now: (): Date => new Date(),
};
