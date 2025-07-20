import { Connection, createBridge, type RequestType } from 'worker-client'

const workerImplementation = {
  greet(name: string) {
    return `Hello, ${name}!`
  },

  async uppercaseMaybe(input: string) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const shouldUpperCase = await bridge.shouldUppercase(input)

    if (shouldUpperCase) {
      return input.toUpperCase()
    }

    return input
  }
}

type MainImplementation = RequestType<'shouldUppercase', (question: string) => boolean>

const connection = new Connection<
  RequestType.fromObject<typeof workerImplementation>,
  MainImplementation
>(globalThis)

export type WorkerConnection = typeof connection

const bridge = createBridge(connection, workerImplementation)
