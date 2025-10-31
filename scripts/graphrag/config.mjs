import 'dotenv/config';
import { fileURLToPath } from 'node:url';

const DEFAULTS = {
  uri: 'bolt://localhost:7687',
  user: 'neo4j',
  password: undefined,
  database: 'neo4j',
  dryRun: false,
  encrypted: undefined,
  trust: undefined,
};

const ARG_ALIASES = new Map([
  ['--neo4j-uri', 'uri'],
  ['--neo4j-user', 'user'],
  ['--neo4j-password', 'password'],
  ['--neo4j-db', 'database'],
  ['--dry-run', 'dryRun'],
  ['--neo4j-encrypted', 'encrypted'],
  ['--neo4j-trust', 'trust'],
]);

const ENV_MAPPING = new Map([
  ['NEO4J_URI', 'uri'],
  ['NEO4J_USER', 'user'],
  ['NEO4J_PASSWORD', 'password'],
  ['NEO4J_DB', 'database'],
  ['NEO4J_ENCRYPTION', 'encrypted'],
  ['NEO4J_TRUST', 'trust'],
]);

function parseArgs(rawArgs) {
  const config = {};
  for (let i = 0; i < rawArgs.length; i += 1) {
    const token = rawArgs[i];
    if (!ARG_ALIASES.has(token)) continue;
    const key = ARG_ALIASES.get(token);
    if (key === 'dryRun') {
      config.dryRun = true;
      continue;
    }

    const nextToken = rawArgs[i + 1];
    if (!nextToken || nextToken.startsWith('--')) {
      throw new Error(`参数 ${token} 需要显式取值`);
    }
    config[key] = nextToken;
    i += 1;
  }
  return config;
}

function parseEnv() {
  const config = {};
  for (const [envKey, configKey] of ENV_MAPPING.entries()) {
    if (process.env[envKey]) {
      config[configKey] = process.env[envKey];
    }
  }
  return config;
}

export function resolveNeo4jConfig(
  rawArgs = process.argv.slice(2),
  { requirePassword = true } = {},
) {
  const envConfig = parseEnv();
  const argConfig = parseArgs(rawArgs);
  const merged = {
    ...DEFAULTS,
    ...envConfig,
    ...argConfig,
  };

  if (typeof merged.encrypted === 'string') {
    const normalized = merged.encrypted.toLowerCase();
    if (normalized === 'on' || normalized === 'true') {
      merged.encrypted = 'ENCRYPTION_ON';
    } else if (normalized === 'strict') {
      merged.encrypted = 'ENCRYPTION_STRICT';
    } else if (normalized === 'off' || normalized === 'false') {
      merged.encrypted = 'ENCRYPTION_OFF';
    }
  }

  if (merged.encrypted === 'none' || merged.encrypted === '') {
    merged.encrypted = undefined;
  }

  if (typeof merged.trust === 'string') {
    const normalizedTrust = merged.trust.toUpperCase();
    merged.trust = normalizedTrust;
  }

  if (requirePassword && !merged.dryRun && !merged.password) {
    throw new Error(
      '缺少 Neo4j 密码，请使用 --neo4j-password 或设置 NEO4J_PASSWORD',
    );
  }

  return merged;
}

export function getScriptName(importMetaUrl) {
  const fullPath = fileURLToPath(importMetaUrl);
  const match = fullPath.match(/([^/]+)$/);
  return match ? match[1] : fullPath;
}
