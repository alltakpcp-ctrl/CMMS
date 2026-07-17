// Seleção reutilizável para nunca vazar passwordHash (§9 do CLAUDE.md).
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;
