/** Signs and verifies login tokens. Set JWT_SECRET to a long random string outside development. */
export const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
