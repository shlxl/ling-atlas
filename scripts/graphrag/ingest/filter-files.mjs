import { readFile } from 'node:fs/promises';

export async function readFilterFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    return new Set(lines);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[ingest.filter] 警告：过滤器文件未找到 ${filePath}，将忽略该参数`);
      return new Set();
    }
    throw error;
  }
}
