import type { RequestType } from 'worker-client'

import type { WorkerConnection } from './bridge.worker.js'

import { afterEach, expect, test, vi } from 'vitest'
import { Connection, createBridge } from 'worker-client'

let worker: Worker

afterEach(() => {
  worker?.terminate()
})

test('call RPC', async () => {
  worker = new Worker(new URL('bridge.worker.js', import.meta.url), { type: 'module' })
  using connection = Connection.invert<WorkerConnection>(worker)
  const bridge = createBridge(connection)

  const greeting = await bridge.greet('worker')

  expect(greeting).toBe('Hello, worker!')
})

test('respond RPC', async () => {
  worker = new Worker(new URL('bridge.worker.js', import.meta.url), { type: 'module' })
  const shouldUppercase = vi.fn(() => true)
  using connection = Connection.invert<WorkerConnection>(worker)
  const bridge = createBridge(connection, { shouldUppercase })

  const result = await bridge.uppercaseMaybe('make this uppercase')

  expect(shouldUppercase).toHaveBeenCalledWith('make this uppercase')
  expect(result).toBe('MAKE THIS UPPERCASE')
})

test('skip properties and symbol keys', () => {
  const implementation = {
    [Symbol('test')]: vi.fn(),
    method: vi.fn(),
    property: ''
  }
  const connection = {
    onNotification: vi.fn(),
    onRequest: vi.fn(),
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
    [Symbol.dispose]: vi.fn()
  } as Partial<Connection<RequestType.fromObject<typeof implementation>>> as Connection<
    RequestType.fromObject<typeof implementation>
  >

  createBridge(connection, implementation)

  expect(connection.onRequest).toHaveBeenCalledExactlyOnceWith('method', expect.any(Function))
})

test('get bridge symbol', () => {
  worker = new Worker(new URL('bridge.worker.js', import.meta.url), { type: 'module' })
  using connection = Connection.invert<WorkerConnection>(worker)
  const bridge = createBridge(connection)

  // @ts-expect-error This tests behaviour the user shouldn’t use.
  expect(bridge[Symbol('test')]).toBeUndefined()
})

test('function identity', () => {
  worker = new Worker(new URL('bridge.worker.js', import.meta.url), { type: 'module' })
  using connection = Connection.invert<WorkerConnection>(worker)
  const bridge = createBridge(connection)

  expect(bridge.greet.name).toBe('greet')
  expect(bridge.greet).toBe(bridge.greet)
})
