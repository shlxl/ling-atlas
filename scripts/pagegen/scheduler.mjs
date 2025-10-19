export class PagegenScheduler {
  constructor({ maxParallel = 1 } = {}) {
    const parsed = Number(maxParallel)
    this.maxParallel = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
  }

  async run(taskFactories = []) {
    const tasks = Array.isArray(taskFactories) ? taskFactories : []
    const executing = new Set()
    const results = []

    for (const factory of tasks) {
      if (typeof factory !== 'function') continue
      const promise = Promise.resolve().then(factory)
      executing.add(promise)
      const remove = () => executing.delete(promise)
      promise.then(remove, remove)
      results.push(promise)
      if (executing.size >= this.maxParallel) {
        await Promise.race(executing)
      }
    }

    return Promise.all(results)
  }
}
