import neo4j from 'neo4j-driver';

export function createDriver({ uri, user, password, encrypted, trust }) {
  const config = {};
  if (typeof encrypted !== 'undefined') {
    config.encrypted = encrypted;
  }
  if (typeof trust !== 'undefined') {
    config.trust = trust;
  }
  return neo4j.driver(uri, neo4j.auth.basic(user, password), config);
}

export async function withSession(driver, database, handler) {
  const session = driver.session({ database });
  try {
    return await handler(session);
  } finally {
    await session.close();
  }
}

export async function verifyConnectivity(driver) {
  await driver.verifyConnectivity();
}
