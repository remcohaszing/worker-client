/**
 * These helper symbols are used to help declare types for the communication between multiple
 * targets. They don’t exist at runtime.
 */
declare namespace symbol {
  const kind: unique symbol
  type kind = typeof kind
  const name: unique symbol
  type name = typeof name
  const params: unique symbol
  type params = typeof params
  const returns: unique symbol
  type returns = typeof returns
}

/**
 * The most generic function type.
 *
 * @param params
 *   Any arguments.
 * @returns
 *   Any value.
 */
export type AnyFunction = (...params: any[]) => unknown

/**
 * Make a value synchronous or asynchronous.
 *
 * @template Value
 * The value to make promisable.
 */
export type Promisable<Value> = PromiseLike<Value> | Value

/**
 * A DOM event target that supports `message` events.
 */
export interface EventTarget {
  /**
   * Register an event listener.
   *
   * @param type
   *   Always `message`
   * @param listener
   *   The callback for the `message` event.
   */
  addEventListener: (type: 'message', listener: (event: MessageEvent) => unknown) => unknown

  /**
   * Remove an event listener.
   *
   * @param type
   *   Always `message`
   * @param listener
   *   The callback for the `message` event.
   */
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => unknown) => unknown

  /**
   * Send a message.
   *
   * @param message
   *   The message to send.
   * @param options
   *   Additional options.
   */
  postMessage: (message: unknown, options?: any) => unknown
}

/**
 * A type used to register notifications.
 *
 * @template Name
 * The name of the notification type.
 * @template Parameters
 * Parameters that are sent from the sender to the receiver.
 */
export interface NotificationType<Name extends string, Parameters extends unknown[]> {
  /**
   * The kind of the notification type.
   */
  [symbol.kind]: 'notification'

  /**
   * The name of the notification type.
   */
  [symbol.name]: Name

  /**
   * The parameters that may be sent with the notification.
   */
  [symbol.params]: Parameters

  /**
   * Notifications don’t return.
   */
  [symbol.returns]: never
}

/**
 * A type used to register requests.
 *
 * @template Name
 * The name of the request type.
 * @template Fn
 * The function signature from which to construct a request type. The function arguments are sent to
 * the receiver. The function return type is sent back to the client asynchronously.
 */
export interface RequestType<Name extends string, Fn extends AnyFunction> {
  /**
   * The kind of the request type.
   */
  [symbol.kind]: 'request'

  /**
   * The name of the request type.
   */
  [symbol.name]: Name

  /**
   * The parameters that may be sent with the request.
   */
  [symbol.params]: Parameters<Fn>

  /**
   * The return value the request responds with.
   */
  [symbol.returns]: Awaited<ReturnType<Fn>>
}

/**
 * Get the name of a notification type or request type.
 *
 * @template Type
 * The type of which to get the name.
 */
export type GetName<Type extends NotificationType.Any | RequestType.Any> = Type[symbol.name]

/**
 * Extract a notification or request type from a union by its name.
 *
 * @template Type
 * The union of notification or request types from which to extract one by its name.
 * @template Name
 * The name of the notification or request type to extract.
 */
export type ByName<
  Type extends NotificationType.Any | RequestType.Any,
  Name extends GetName<Type>
> = Extract<Type, Record<symbol.name, Name>>

export type Params<
  Type extends NotificationType.Any | RequestType.Any,
  Name extends GetName<Type> = GetName<Type>
> = ByName<Type, Name>[symbol.params]

export type ReturnValue<Type extends RequestType.Any, Name extends GetName<Type>> = ByName<
  Type,
  Name
>[symbol.returns]

export namespace NotificationType {
  /**
   * Any valid notification type.
   */
  export type Any = NotificationType<string, any[]>
}

export namespace RequestType {
  /**
   * Any valid request type.
   */
  export type Any = RequestType<string, AnyFunction>

  /**
   * Convert an object type to a request type.
   *
   * This is useful if you have already defined a class or object, and want to create a bridge from
   * that.
   *
   * Example using a pojo:
   * ```ts
   * const myWorkerImplementation = {
   *   fetch(uri: string) {}
   * }
   *
   * type MyRequestType = RequestType.fromObject<typeof myWorkerImplementation>
   * ```
   *
   * Example using a class:
   *
   * ```ts
   * class MyWorkerImplementation {
   *   fetch(uri: string) {}
   * }
   *
   * type MyRequestType = RequestType.fromObject<MyWorkerImplementation>
   * ```
   *
   * @template Type
   * The object type to create a request type from.
   */
  export type fromObject<Type extends object> = {
    [Key in keyof Type]: Key extends string
      ? Type[Key] extends AnyFunction
        ? RequestType<Key, Type[Key]>
        : never
      : never
  }[keyof Type]

  /**
   * Convert a request type to a bridge.
   *
   * Regardless of the implementation, bridge methods always return a promise.
   *
   * @template Type
   * The request type to create a bridge type from.
   */
  export type toBridge<Type extends RequestType.Any> = {
    [Key in GetName<Type>]: (...params: Params<Type, Key>) => Promise<ReturnValue<Type, Key>>
  }

  export type toImplementation<Type extends RequestType.Any> = {
    [Key in GetName<Type>]: (...params: Params<Type, Key>) => Promisable<ReturnValue<Type, Key>>
  }
}

/**
 * A connection between two message event targets.
 *
 * The connection is disposable. If it’s disposed, the event listener on the target is removed.
 *
 * @template OnRequestType
 * The type of the requests the connection will expect.
 * @template SendRequestType
 * The type of the requests the connection will send.
 * @template OnNotificationType
 * The type of the notifications the connection will expect.
 * @template SendNotificationType
 * The type of the notifications the connection will send.
 */
export interface Connection<
  OnRequestType extends RequestType.Any = never,
  SendRequestType extends RequestType.Any = never,
  OnNotificationType extends NotificationType.Any = never,
  SendNotificationType extends NotificationType.Any = never
> extends Disposable {
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
  onRequest: <Name extends GetName<OnRequestType>>(
    name: Name,
    callback: RequestType.toImplementation<OnRequestType>[Name]
  ) => Disposable

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
  sendRequest: <Name extends GetName<SendRequestType>>(
    name: Name,
    ...params: Name extends never ? any[] : Params<SendRequestType, Name>
  ) => Promise<ReturnValue<SendRequestType, Name>>

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
  onNotification: <Name extends GetName<OnNotificationType>>(
    name: Name,
    callback: (...params: Params<OnNotificationType, Name>) => unknown
  ) => Disposable

  /**
   * Send a notification to the connection target.
   *
   * @param name
   *   The type of notification to send.
   * @param params
   *   Parameters to send with the notification.
   */
  sendNotification: <Name extends GetName<SendNotificationType>>(
    name: Name,
    ...params: Name extends never ? any[] : Params<SendNotificationType, Name>
  ) => undefined
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
   * The connection to get the `OnRequestType` for.
   */
  export type getOnRequestType<Conn> =
    Conn extends Connection<infer OnRequestType, any, any, any> ? OnRequestType : never

  /**
   * Get the `SendRequestType` of a connection.
   *
   * @template Conn
   * The connection to get the `SendRequestType` for.
   */
  export type getSendRequestType<Conn> =
    Conn extends Connection<any, infer SendRequestType, any, any> ? SendRequestType : never

  /**
   * Get the `OnNotificationType` of a connection.
   *
   * @template Conn
   * The connection to get the `OnNotificationType` for.
   */
  export type getOnNotificationType<Conn> =
    Conn extends Connection<any, any, infer OnNotificationType, any> ? OnNotificationType : never

  /**
   * Get the `SendNotificationType` of a connection.
   *
   * @template Conn
   * The connection to get the `SendNotificationType` for.
   */
  export type getSendNotificationType<Conn> =
    Conn extends Connection<any, any, any, infer SendNotificationType>
      ? SendNotificationType
      : never
}
