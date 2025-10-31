#!/usr/bin/env node
import process from 'node:process';

import { resolveNeo4jConfig, getScriptName } from './config.mjs';
import { createDriver, verifyConnectivity, withSession } from './neo4j-client.mjs';
import { UNIQUE_CONSTRAINTS, INDEXES } from './schema.mjs';

function formatStatement(statement) {
  return statement.replace(/\s+/g, ' ').trim();
}

async function applyStatements(session, statements) {
  for (const statement of statements) {
    const trimmed = formatStatement(statement);
    await session.run(statement);
    console.log(`✅ ${trimmed}`);
  }
}

async function main() {
  const scriptName = getScriptName(import.meta.url);
  const config = resolveNeo4jConfig();

  console.log(`[${scriptName}] 连接到 ${config.uri} / ${config.database}`);

  if (config.dryRun) {
    console.log('[dry-run] 将执行以下约束/索引语句：');
    [...UNIQUE_CONSTRAINTS, ...INDEXES]
      .map(formatStatement)
      .forEach((statement) => console.log(`• ${statement}`));
    return;
  }

  const driver = createDriver(config);
  try {
    await verifyConnectivity(driver);
    console.log(`[${scriptName}] 已验证连接`);

    await withSession(driver, config.database, async (session) => {
      console.log(`[${scriptName}] 创建唯一约束`);
      await applyStatements(session, UNIQUE_CONSTRAINTS);

      console.log(`[${scriptName}] 创建索引`);
      await applyStatements(session, INDEXES);
    });

    console.log(`[${scriptName}] 已完成`);
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
