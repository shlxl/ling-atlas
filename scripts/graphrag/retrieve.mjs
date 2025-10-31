#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

import { resolveNeo4jConfig, getScriptName } from './config.mjs';
import { createDriver, verifyConnectivity } from './neo4j-client.mjs';
import { fetchSubgraph } from './retrieval/subgraph.mjs';
import { fetchShortestPath } from './retrieval/path.mjs';
import { fetchTopN } from './retrieval/topn.mjs';
import { searchHybrid } from './vector-search.mjs';

const VALUE_OPTIONS = new Map([
  ['--vector-index', 'vectorIndex'],
  ['--mode', 'mode'],
  ['--input', 'input'],
  ['--output', 'output'],
  ['--max-hops', 'maxHops'],
  ['--limit', 'limit'],
]);

const BOOLEAN_OPTIONS = new Map([
  ['--pretty', 'pretty'],
]);

async function readJson(source) {
  if (!source || source === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  const content = await readFile(source, 'utf8');
  return JSON.parse(content);
}

function collectMultiArgs(args, key) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === key) {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`参数 ${key} 需要显式取值`);
      }
      values.push(next);
      i += 1;
    }
  }
  return values;
}

function parseArgs(rawArgs) {
  const options = {
    pretty: false,
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index];

    if (VALUE_OPTIONS.has(token)) {
      const key = VALUE_OPTIONS.get(token);
      const next = rawArgs[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`参数 ${token} 需要显式取值`);
      }
      options[key] = next;
      index += 1;
      continue;
    }

    if (BOOLEAN_OPTIONS.has(token)) {
      const key = BOOLEAN_OPTIONS.get(token);
      options[key] = true;
      continue;
    }
  }

  options.includeLabels = collectMultiArgs(rawArgs, '--include-label');
  options.hybridSources = collectMultiArgs(rawArgs, '--hybrid-source');
  options.hybridAlpha = collectMultiArgs(rawArgs, '--hybrid-alpha');

  return options;
}

async function dispatch({ mode, payload, driver, database, cliOptions }) {
  switch (mode) {
    case 'hybrid':
      return searchHybrid(driver, database, {
        question: payload.question ?? null,
        embedding: payload.embedding ?? null,
        limit: cliOptions.limit ?? payload.limit ?? 5,
        vectorIndex: cliOptions.vectorIndex ?? payload.vectorIndex,
        sources: cliOptions.hybridSources?.length ? cliOptions.hybridSources : payload.sources,
        alpha: (cliOptions.hybridAlpha ?? []).map(Number).filter((v) => !Number.isNaN(v)).length
          ? (cliOptions.hybridAlpha ?? []).map(Number).filter((v) => !Number.isNaN(v))
          : payload.alpha,
      });
    case 'subgraph':
      return fetchSubgraph(driver, database, {
        maxHops: cliOptions.maxHops ?? payload.maxHops,
        limit: cliOptions.limit ?? payload.limit,
        allowedLabels: (cliOptions.includeLabels?.length ? cliOptions.includeLabels : undefined) ?? payload.allowedLabels,
        ...payload,
      });
    case 'path':
      return fetchShortestPath(driver, database, {
        maxLength: cliOptions.maxHops ?? payload.maxLength,
        ...payload,
      });
    case 'topn':
      return fetchTopN(driver, database, {
        limit: cliOptions.limit ?? payload.limit,
        ...payload,
      });
    default:
      throw new Error(`未知 mode：${mode}`);
  }
}

async function main() {
  const scriptName = getScriptName(import.meta.url);
  const rawArgs = process.argv.slice(2);
  const options = parseArgs(rawArgs);

  if (!options.mode) {
    throw new Error('请通过 --mode 指定 subgraph/path/topn');
  }

  const payload = await readJson(options.input);
  const neo4jConfig = resolveNeo4jConfig(rawArgs, { requirePassword: true });

  if (typeof options.maxHops === 'string') {
    const parsed = Number.parseInt(options.maxHops, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      throw new Error('`--max-hops` 需要大于 0 的整数');
    }
    options.maxHops = parsed;
  }

  if (typeof options.limit === 'string') {
    const parsed = Number.parseInt(options.limit, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      throw new Error('`--limit` 需要大于 0 的整数');
    }
    options.limit = parsed;
  }

  const driver = createDriver(neo4jConfig);
  try {
    await verifyConnectivity(driver);
    const result = await dispatch({
      mode: options.mode,
      payload,
      driver,
      database: neo4jConfig.database,
      cliOptions: options,
    });

    const serialized = JSON.stringify(
      result,
      null,
      options.pretty ? 2 : undefined,
    );
    if (options.output) {
      await writeFile(options.output, `${serialized}\n`, 'utf8');
    } else {
      process.stdout.write(`${serialized}\n`);
    }
  } finally {
    await driver.close();
  }

  console.error(`[${scriptName}] 完成 ${options.mode} 查询`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
