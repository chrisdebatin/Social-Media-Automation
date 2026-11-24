import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function jsonError(e: unknown, status = 400) {
  const message =
    e instanceof ZodError
      ? `Ungültige Eingabe: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`
      : e instanceof Error
        ? e.message
        : String(e);
  if (status >= 500) console.error(e);
  return NextResponse.json({ error: message }, { status });
}
