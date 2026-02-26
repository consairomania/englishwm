// ─── Mapare cod cameră ↔ session_id ──────────────────────────────────────────
// Cod "1234" → session_id "00001234-0000-0000-0000-000000000000"
// Determinist: nu necesită coloană suplimentară în DB.

export function roomCodeToSessionId(code: string): string {
  const padded = code.trim().padStart(8, '0');
  return `${padded}-0000-0000-0000-000000000000`;
}

export function sessionIdToRoomCode(sessionId: string): string {
  // extrage primele 8 caractere și elimină zero-urile de prefix
  const prefix = sessionId.split('-')[0];
  return String(parseInt(prefix, 10));
}

export function generateRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function isValidRoomCode(code: string): boolean {
  return /^\d{4}$/.test(code.trim());
}
