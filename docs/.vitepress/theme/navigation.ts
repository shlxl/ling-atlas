import type { Router } from 'vitepress'

export function redirectTo(router: Router, target: string) {
  if (!target) return
  if (typeof window !== 'undefined') {
    window.location.replace(target)
  } else {
    router.go(target)
  }
}
