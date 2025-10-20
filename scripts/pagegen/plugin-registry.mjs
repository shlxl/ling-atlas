export class PagegenPluginRegistry {
  constructor(plugins = []) {
    this.plugins = Array.isArray(plugins) ? plugins.filter(Boolean) : []
  }

  use(plugin) {
    if (plugin && typeof plugin === 'object') {
      this.plugins.push(plugin)
    }
    return this
  }

  async runHook(hookName, stage, payload) {
    for (const plugin of this.plugins) {
      const handler = plugin?.[hookName]
      if (typeof handler === 'function') {
        await handler(stage, payload)
      }
    }
  }
}

export function createPluginRegistry(initialPlugins = []) {
  return new PagegenPluginRegistry(initialPlugins)
}
