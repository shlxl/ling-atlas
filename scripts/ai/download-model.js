// scripts/ai/download-model.js
import { pipeline } from '@xenova/transformers';

const run = async () => {
  try {
    // 使用 Xenova 提供的 ONNX 模型，而不是原始的 sentence-transformers 仓库
    const extractor = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );

    // 随便跑一次，确保模型文件被下载并缓存
    const output = await extractor('hello world');
    console.log('✅ 模型已下载并缓存到本地');
    console.log('示例输出向量长度:', output[0].length);
  } catch (err) {
    console.error('❌ 下载或初始化模型失败:', err);
  }
};

run();