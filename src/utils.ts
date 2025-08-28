import type { AnyFunction } from './types.js'

/**
 * Ensure a function has a name. The name is only assigned the function doesn’t already have a name.
 *
 * @template Fn
 *   The type of the function.
 * @param fn
 *   The function that should have a name.
 * @param name
 *   The name to assign in case it’s missing.
 * @returns
 *   The function.
 */
export function ensureFunctionName<Fn extends AnyFunction>(fn: Fn, name: string): Fn {
  if (!fn.name) {
    Object.defineProperty(fn, 'name', {
      value: name
    })
  }

  return fn
}
