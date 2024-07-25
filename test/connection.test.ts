import { afterEach, describe, expect, test, vi } from 'vitest'
import { type Connection, createConnection } from 'worker-client'

type TestConnection = Connection.invert<import('./connection.worker.js').TestConnection>

let worker: Worker

afterEach(() => {
  worker.terminate()
})

describe('request', () => {
  test('success', async () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)

    const pet = await connection.sendRequest('getPet', 42)

    expect(pet).toStrictEqual({
      id: 42,
      species: 'cat',
      name: 'Mr Meow'
    })
  })

  test('throws error', async () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)

    async function two(): Promise<undefined> {
      await connection.sendRequest('throwError')
    }

    async function one(): Promise<undefined> {
      await two()
    }

    try {
      await one()
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      const error = err as Error
      expect(error.message).toBe('I can only count to four')
      expect(error.cause).toBe('Math')
      const stack = error.stack!
      const lines = stack.split('\n')
      expect(lines).toEqual([
        'Error: I can only count to four',
        expect.stringMatching(/ at four /),
        expect.stringMatching(/ at three /),
        expect.stringMatching(/ at throwError /),
        expect.stringMatching(/ at onMessage /),
        expect.stringMatching(/ at Object.sendRequest /),
        expect.stringMatching(/ at async two /),
        expect.stringMatching(/ at async one /),
        expect.stringContaining(import.meta.url),
        expect.any(String)
      ])
      return
    }
    expect.fail('Expected to throw')
  })

  test('throws literal', async () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)

    await expect(connection.sendRequest('throwLiteral')).rejects.toThrow('literal')
  })

  test('not implemented', async () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)

    try {
      await connection.sendRequest('callCallback')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      const error = err as Error
      expect(error.message).toBe('Request not implemented: callback')
      expect(error.cause).toBe('callback')
      return
    }
    expect.fail('Expected to throw')
  })

  test('unserializable response', async () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)

    connection.onRequest('callback', () => Symbol('unclonable'))

    await expect(() => connection.sendRequest('callCallback')).rejects.toThrow(
      "Failed to execute 'postMessage' on 'Worker': Symbol(unclonable) could not be cloned."
    )
  })

  test('unserializable error', async () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)

    connection.onRequest('callback', () => {
      throw Symbol('unclonable')
    })

    await expect(() => connection.sendRequest('callCallback')).rejects.toThrow(
      "Failed to execute 'postMessage' on 'Worker': Symbol(unclonable) could not be cloned."
    )
  })

  test('handle onRequest', async () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)
    const callback = vi.fn(() => 'ok')

    connection.onRequest('callback', callback)
    const response = await connection.sendRequest('callCallback')

    expect(callback).toHaveBeenCalledExactlyOnceWith()
    expect(response).toBe('ok')
  })

  test('unknown response ID', async () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)

    const promise = new Promise((resolve, reject) => {
      globalThis.addEventListener(
        'unhandledrejection',
        (event) => {
          event.preventDefault()
          reject(event.reason)
        },
        { once: true }
      )
    })
    await connection.sendRequest('postMessage', { type: 2, id: 1337 })
    await expect(promise).rejects.toThrowError(new Error('Missing callback for response ID 1337'))
  })

  test('dispose onRequest', () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)
    const callback = vi.fn()

    connection.onRequest('callback', callback)[Symbol.dispose]()
    connection.sendRequest('callCallback')

    expect(callback).not.toHaveBeenCalled()
  })

  test('duplicate callback', () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)
    const callback = vi.fn()
    connection.onRequest('callback', callback)

    expect(() => connection.onRequest('callback', callback)).toThrowError(
      'A callback has already been registered for callback'
    )
  })

  test('disposed connection', async () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    const connection = createConnection<TestConnection>(worker)
    connection[Symbol.dispose]()

    expect(() => connection.onRequest('callback', vi.fn())).toThrowError(
      new Error('Connection is disposed')
    )
    await expect(connection.sendRequest('callCallback')).rejects.toThrowError(
      new Error('Connection is disposed')
    )
  })
})

describe('notification', () => {
  test('notification', async () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)

    const email = await new Promise((resolve) => {
      connection.onNotification('receivedEmail', resolve)
      connection.sendNotification('sendEmail', 'ne@exanple.com', 'subject', 'Hey you', [])
    })

    expect(email).toStrictEqual({
      sender: 'ne@exanple.com',
      subject: 'subject',
      body: 'Hey you',
      attachments: []
    })
  })

  test('dispose onNotification', async () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    using connection = createConnection<TestConnection>(worker)
    const receivedEmail = vi.fn()

    await new Promise((resolve) => {
      connection.onNotification('receivedEmail', resolve)
      connection.onNotification('receivedEmail', () => receivedEmail())
      connection.onNotification('receivedEmail', () => receivedEmail())
      connection.onNotification('receivedEmail', () => receivedEmail())[Symbol.dispose]()
      connection.sendNotification('sendEmail', 'ne@exanple.com', 'subject', 'Hey you', [])
    })

    expect(receivedEmail).toHaveBeenCalledTimes(2)
  })

  test('disposed connection', () => {
    worker = new Worker(new URL('connection.worker.js', import.meta.url), { type: 'module' })
    const connection = createConnection<TestConnection>(worker)
    connection[Symbol.dispose]()

    expect(() => connection.onNotification('receivedEmail', vi.fn())).toThrowError(
      new Error('Connection is disposed')
    )
    expect(() => connection.sendNotification('sendEmail', '', '', '', [])).toThrowError(
      new Error('Connection is disposed')
    )
  })
})
