import {
  type AnyFunction,
  type Connection,
  type EventTarget,
  type GetName,
  type NotificationType,
  type Params,
  type RequestType,
  type ReturnValue
} from './types.js'
import { ensureFunctionName } from './utils.js'

const enum MessageType {
  NOTIFICATION = 0,
  REQUEST = 1,
  RESPONSE = 2
}

interface Notification {
  /**
   * This is a notification.
   */
  type: MessageType.NOTIFICATION

  /**
   * The name of the notification type.
   */
  name: string

  /**
   * The params that may be sent with the notification type.
   */
  params: unknown[]
}

interface Request {
  /**
   * This is a request.
   */
  type: MessageType.REQUEST

  /**
   * The name of the notification type.
   */
  name: string

  /**
   * The params that may be sent with the notification type.
   */
  params: unknown[]

  /**
   * The auto incremented id that should be responded to.
   */
  id: number
}

interface Response {
  /**
   * This is a response.
   */
  type: MessageType.RESPONSE

  /**
   * The result of the function that handled the request.
   */
  result?: unknown

  /**
   * The error that was thrown by the function that handled the request.
   */
  error?: unknown

  /**
   * The request ID this is a response to.
   */
  id: number
}

type Data = Notification | Request | Response

/**
 * An object what can resolve or reject a promise.
 *
 * @template Value
 * The value to resolve with.
 */
interface Resolver<Value> {
  /**
   * A function to resolve a request.
   */
  resolve: (value: Value) => unknown

  /**
   * A function to reject a request.
   */
  reject: AnyFunction
}

/**
 * Create a typed connection.
 *
 * @template Conn
 * The type of the connection to create.
 * @param target
 *   The DOM message event target to communicate with.
 * @param options
 *   Additional options to pass into `target.postMessage()`.
 * @returns
 *   A typed connection.
 */
export function createConnection<
  Conn extends Connection<
    RequestType.Any,
    RequestType.Any,
    NotificationType.Any,
    NotificationType.Any
  >
>(target: EventTarget, options?: unknown): Conn

/**
 * Create a typed connection.
 *
 * @template OnRequestType
 * The type of the requests the connection will expect.
 * @template SendRequestType
 * The type of the requests the connection will send.
 * @template OnNotificationType
 * The type of the notifications the connection will expect.
 * @template SendNotificationType
 * The type of the notifications the connection will send.
 * @param target
 *   The DOM message event target to communicate with.
 * @param options
 *   Additional options to pass into `target.postMessage()`.
 * @returns
 *   A typed connection.
 */
export function createConnection<
  OnRequestType extends RequestType.Any = never,
  SendRequestType extends RequestType.Any = never,
  OnNotificationType extends NotificationType.Any = never,
  SendNotificationType extends NotificationType.Any = never
>(
  target: EventTarget,
  options?: unknown
): Connection<OnRequestType, SendRequestType, OnNotificationType, SendNotificationType>

/**
 * Create a typed connection.
 *
 * @param target
 *   The DOM message event target to communicate with.
 * @param options
 *   Additional options to pass into `target.postMessage()`.
 * @returns
 *   A typed connection.
 */
export function createConnection<
  OnRequestType extends RequestType.Any,
  SendRequestType extends RequestType.Any,
  OnNotificationType extends NotificationType.Any,
  SendNotificationType extends NotificationType.Any
>(
  target: EventTarget,
  options?: unknown
): Connection<OnRequestType, SendRequestType, OnNotificationType, SendNotificationType> {
  let disposed = false
  let requestId = 0

  const notificationCallbacks = new Map<
    GetName<OnNotificationType>,
    Set<(...params: Params<OnNotificationType>) => unknown>
  >()

  const requestCallbacks = new Map<
    GetName<OnRequestType>,
    (...params: Params<OnRequestType>) => unknown
  >()

  const resolvers = new Map<
    number,
    Resolver<ReturnValue<SendRequestType, GetName<SendRequestType>>>
  >()

  const checkDisposed = (): undefined => {
    if (disposed) {
      throw new Error('Connection is disposed')
    }
  }

  const send = (data: Data): undefined => {
    target.postMessage(data, options)
  }

  const onMessage = async ({ data }: MessageEvent<Data>): Promise<undefined> => {
    if (data.type === MessageType.NOTIFICATION) {
      const { name, params } = data
      const callbacks = notificationCallbacks.get(name)

      if (!callbacks) {
        return
      }

      for (const callback of callbacks) {
        callback?.(...params)
      }
    } else if (data.type === MessageType.REQUEST) {
      const { id, name, params } = data
      const callback = requestCallbacks.get(name)

      if (!callback) {
        send({
          type: MessageType.RESPONSE,
          id,
          error: new Error(`Request not implemented: ${name}`, { cause: name })
        })
        return
      }

      try {
        try {
          const result = await callback(...params)
          send({ type: MessageType.RESPONSE, id, result })
        } catch (error) {
          send({ type: MessageType.RESPONSE, id, error })
        }
      } catch (error) {
        send({ type: MessageType.RESPONSE, id, error })
      }
    } else if (data.type === MessageType.RESPONSE) {
      const { error, id, result } = data
      const callbacks = resolvers.get(id)

      if (!callbacks) {
        throw new Error(`Missing callback for response ID ${id}`, { cause: data })
      }

      resolvers.delete(id)

      if (error) {
        callbacks.reject(error)
      } else {
        callbacks.resolve(result)
      }
    }
  }

  target.addEventListener('message', onMessage)

  return {
    onRequest(name, callback) {
      checkDisposed()

      if (requestCallbacks.has(name)) {
        throw new Error(`A callback has already been registered for ${name}`)
      }

      requestCallbacks.set(name, ensureFunctionName(callback, name))

      return {
        [Symbol.dispose]() {
          requestCallbacks.delete(name)
        }
      }
    },

    async sendRequest(name, ...params) {
      checkDisposed()

      const promise = new Promise((resolve, reject) => {
        requestId = (requestId % Number.MAX_SAFE_INTEGER) + 1
        resolvers.set(requestId, { resolve, reject })
      })
      send({
        type: MessageType.REQUEST,
        id: requestId,
        name,
        params
      })

      try {
        return await promise
      } catch (error) {
        if (error instanceof Error) {
          const { stack } = new Error()
          error.stack += stack!.slice(stack!.indexOf('\n'))
        }
        throw error
      }
    },

    onNotification(name, callback) {
      checkDisposed()

      let callbacks = notificationCallbacks.get(name)
      if (!callbacks) {
        callbacks = new Set()
        notificationCallbacks.set(name, callbacks)
      }

      callbacks.add(ensureFunctionName(callback, name))

      return {
        [Symbol.dispose]() {
          callbacks.delete(callback)
        }
      }
    },

    sendNotification(name, ...params) {
      checkDisposed()

      send({ type: MessageType.NOTIFICATION, name, params })
    },

    [Symbol.dispose]() {
      disposed = true
      requestCallbacks.clear()
      notificationCallbacks.clear()
      target.removeEventListener('message', onMessage)
    }
  }
}
