import { type Connection } from './connection.js'
import { type AnyFunction, type NotificationType, type RequestType } from './types.js'
import { ensureFunctionName } from './utils.js'

/**
 * Create a bridge based on a typed connection.
 *
 * @param connection
 *   The connection for which to create a bridge.
 * @param implementation
 *   The implementation on this side of the connection.
 * @returns
 *   An proxy object with methods that correspond to the implementation on the other side of the
 *   connection.
 */
export function createBridge<
  Conn extends Connection<
    RequestType.Any,
    RequestType.Any,
    NotificationType.Any,
    NotificationType.Any
  >
>(
  connection: Conn,
  implementation?: RequestType.toImplementation<Connection.getOnRequestType<Conn>>
): RequestType.toBridge<Connection.getSendRequestType<Conn>> {
  const fnMap = new Map<string, AnyFunction>()

  if (implementation) {
    for (const key in implementation) {
      const fn = implementation[key as keyof typeof implementation]

      if (typeof fn === 'function') {
        connection.onRequest(key, fn.bind(implementation))
      }
    }
  }

  return new Proxy({} as RequestType.toBridge<Connection.getSendRequestType<Conn>>, {
    get(target, name) {
      if (typeof name !== 'string') {
        return
      }

      let fn = fnMap.get(name)
      if (!fn) {
        fn = ensureFunctionName((...params) => connection.sendRequest(name, ...params), name)
        fnMap.set(name, fn)
      }

      return fn
    }
  })
}
