export function getEnv(name, fallback = null) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }

  return value;
}

export function requireEnv(name) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
