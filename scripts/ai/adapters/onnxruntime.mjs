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

export async function generateEmbeddings() {
  throw new Error(
    'onnxruntime adapter 尚未实现具体逻辑，请根据本地模型加载需求自行扩展 generateEmbeddings，并返回 { items } 结构。'
  )
}
