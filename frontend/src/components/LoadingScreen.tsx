export function LoadingScreen() {
  return (
    <div role="status" className="grid min-h-screen place-items-center text-muted-foreground">
      <p className="flex items-center gap-3">
        <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Cargando…
      </p>
    </div>
  );
}
