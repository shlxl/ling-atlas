let ort
try {
  ort = await import('onnxruntime-node')
} catch (error) {
  const message = error?.message || String(error)
  throw new Error(
    'onnxruntime adapter 需要可选依赖 `onnxruntime-node`。请先安装：npm install onnxruntime-node\n' +
      `原始错误：${message}`
  )
}

export const runtime = ort

function notImplemented(method) {
  return new Error(
    `onnxruntime adapter 尚未实现 ${method}，请根据本地模型加载需求扩展 ${method} 并返回 { items } 结构。`
  )
}

export async function generateEmbeddings() {
  throw notImplemented('generateEmbeddings')
}

export async function summarize() {
  throw notImplemented('summarize')
}

export async function buildQA() {
  throw notImplemented('buildQA')
}
