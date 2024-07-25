import { createBridge, createConnection, type RequestType } from 'worker-client'

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

export const connection = createConnection<
  RequestType.fromObject<typeof workerImplementation>,
  MainImplementation
>(globalThis)

const bridge = createBridge(connection, workerImplementation)
