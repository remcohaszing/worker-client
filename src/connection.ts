import type {
  AnyFunction,
  EventTarget,
  GetName,
  NotificationType,
  Params,
  RequestType,
  ReturnValue
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
 *   The value to resolve with.
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
 * A connection between two message event targets.
 *
 * The connection is disposable. If it’s disposed, the event listener on the target is removed.
 *
 * @template OnRequestType
 *   The type of the requests the connection will expect.
 * @template SendRequestType
 *   The type of the requests the connection will send.
 * @template OnNotificationType
 *   The type of the notifications the connection will expect.
 * @template SendNotificationType
 *   The type of the notifications the connection will send.
 */
export class Connection<
  OnRequestType extends RequestType.Any = never,
  SendRequestType extends RequestType.Any = never,
  OnNotificationType extends NotificationType.Any = never,
  SendNotificationType extends NotificationType.Any = never
> implements Disposable
{
  #target: EventTarget

  #options: unknown

  #disposed = false

  #requestId = 0

  #notificationCallbacks = new Map<
    GetName<OnNotificationType>,
    Set<(...params: Params<OnNotificationType>) => unknown>
  >()

  #requestCallbacks = new Map<
    GetName<OnRequestType>,
    (...params: Params<OnRequestType>) => unknown
  >()

  #resolvers = new Map<number, Resolver<ReturnValue<SendRequestType, GetName<SendRequestType>>>>()

  constructor(target: EventTarget, options?: unknown) {
    this.#target = target
    this.#options = options
    target.addEventListener('message', this.#onMessage)
  }

  static invert<
    Conn extends Connection<
      RequestType.Any,
      RequestType.Any,
      NotificationType.Any,
      NotificationType.Any
    >
  >(target: EventTarget, options?: unknown): Connection.invert<Conn> {
    return new Connection(target, options)
  }

  /**
   * Respond to a request from the connection target.
   *
   * Only one callback may be registered per request type.
   *
   * @param name
   *   The name of request type to respond to.
   * @param callback
   *   The implementation function that will be called with the request parameters.
   * @returns
   *   A disposable.
   */
  onRequest<Name extends GetName<OnRequestType>>(
    name: Name,
    callback: RequestType.toImplementation<OnRequestType>[Name]
  ): Disposable {
    this.#checkDisposed()

    if (this.#requestCallbacks.has(name)) {
      throw new Error(`A callback has already been registered for ${name}`)
    }

    this.#requestCallbacks.set(name, ensureFunctionName(callback, name))

    return {
      [Symbol.dispose]: () => {
        this.#requestCallbacks.delete(name)
      }
    }
  }

  /**
   * Send a request to the connection target.
   *
   * @param name
   *   The type of request to send.
   * @param params
   *   Parameters to send with the request.
   * @returns
   *   A promisified version of the implementation in the listening connection.
   */
  async sendRequest<Name extends GetName<SendRequestType>>(
    name: Name,
    ...params: Name extends never ? any[] : Params<SendRequestType, Name>
  ): Promise<ReturnValue<SendRequestType, Name>> {
    this.#checkDisposed()

    const promise = new Promise((resolve, reject) => {
      this.#requestId = (this.#requestId % Number.MAX_SAFE_INTEGER) + 1
      this.#resolvers.set(this.#requestId, { resolve, reject })
    })
    this.#send({
      type: MessageType.REQUEST,
      id: this.#requestId,
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
  }

  /**
   * Respond to a notification from the connection target.
   *
   * @param name
   *   The notification type to respond to.
   * @param callback
   *   A function that will be called with the notification parameters.
   * @returns
   *   A disposable.
   */
  onNotification<Name extends GetName<OnNotificationType>>(
    name: Name,
    callback: (...params: Params<OnNotificationType, Name>) => unknown
  ): Disposable {
    this.#checkDisposed()

    let callbacks = this.#notificationCallbacks.get(name)
    if (!callbacks) {
      callbacks = new Set()
      this.#notificationCallbacks.set(name, callbacks)
    }

    callbacks.add(ensureFunctionName(callback, name))

    return {
      [Symbol.dispose]() {
        callbacks.delete(callback)
      }
    }
  }

  /**
   * Send a notification to the connection target.
   *
   * @param name
   *   The type of notification to send.
   * @param params
   *   Parameters to send with the notification.
   */
  sendNotification<Name extends GetName<SendNotificationType>>(
    name: Name,
    ...params: Name extends never ? any[] : Params<SendNotificationType, Name>
  ): undefined {
    this.#checkDisposed()

    this.#send({ type: MessageType.NOTIFICATION, name, params })
  }

  [Symbol.dispose](): undefined {
    this.#disposed = true
    this.#requestCallbacks.clear()
    this.#notificationCallbacks.clear()
    this.#target.removeEventListener('message', this.#onMessage)
  }

  #checkDisposed(): undefined {
    if (this.#disposed) {
      throw new Error('Connection is disposed')
    }
  }

  #send(data: Data): undefined {
    this.#target.postMessage(data, this.#options)
  }

  #onMessage = async ({ data }: MessageEvent<Data>): Promise<undefined> => {
    if (data.type === MessageType.NOTIFICATION) {
      const { name, params } = data
      const callbacks = this.#notificationCallbacks.get(name)

      if (!callbacks) {
        return
      }

      for (const callback of callbacks) {
        callback?.(...params)
      }
    } else if (data.type === MessageType.REQUEST) {
      const { id, name, params } = data
      const callback = this.#requestCallbacks.get(name)

      if (!callback) {
        this.#send({
          type: MessageType.RESPONSE,
          id,
          error: new Error(`Request not implemented: ${name}`, { cause: name })
        })
        return
      }

      try {
        try {
          const result = await callback(...params)
          this.#send({ type: MessageType.RESPONSE, id, result })
        } catch (error) {
          this.#send({ type: MessageType.RESPONSE, id, error })
        }
      } catch (error) {
        this.#send({ type: MessageType.RESPONSE, id, error })
      }
    } else if (data.type === MessageType.RESPONSE) {
      const { error, id, result } = data
      const callbacks = this.#resolvers.get(id)

      if (!callbacks) {
        throw new Error(`Missing callback for response ID ${id}`, { cause: data })
      }

      this.#resolvers.delete(id)

      if (error) {
        callbacks.reject(error)
      } else {
        callbacks.resolve(result)
      }
    }
  }
}

export namespace Connection {
  /**
   * Invert the request and notification types of a connection.
   *
   * @template Conn
   */
  export type invert<
    Conn extends Connection<
      RequestType.Any,
      RequestType.Any,
      NotificationType.Any,
      NotificationType.Any
    >
  > = Connection<
    getSendRequestType<Conn>,
    getOnRequestType<Conn>,
    getSendNotificationType<Conn>,
    getOnNotificationType<Conn>
  >

  /**
   * Get the `OnRequestType` of a connection.
   *
   * @template Conn
   *   The connection to get the `OnRequestType` for.
   */
  export type getOnRequestType<Conn> =
    Conn extends Connection<infer OnRequestType, any, any, any> ? OnRequestType : never

  /**
   * Get the `SendRequestType` of a connection.
   *
   * @template Conn
   *   The connection to get the `SendRequestType` for.
   */
  export type getSendRequestType<Conn> =
    Conn extends Connection<any, infer SendRequestType, any, any> ? SendRequestType : never

  /**
   * Get the `OnNotificationType` of a connection.
   *
   * @template Conn
   *   The connection to get the `OnNotificationType` for.
   */
  export type getOnNotificationType<Conn> =
    Conn extends Connection<any, any, infer OnNotificationType, any> ? OnNotificationType : never

  /**
   * Get the `SendNotificationType` of a connection.
   *
   * @template Conn
   *   The connection to get the `SendNotificationType` for.
   */
  export type getSendNotificationType<Conn> =
    Conn extends Connection<any, any, any, infer SendNotificationType>
      ? SendNotificationType
      : never
}
