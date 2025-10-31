#!/usr/bin/env node
import 'dotenv/config';
import { spawn } from 'node:child_process';
import process from 'node:process';

const base = process.env.BASE || '/';
const args = ['dev', 'docs', '--host', '0.0.0.0', '--base', base, ...process.argv.slice(2)];

const child = spawn('npx', ['vitepress', ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exitCode = code;
});
