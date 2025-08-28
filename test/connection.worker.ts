import type { NotificationType, RequestType } from 'worker-client'

import { Connection } from 'worker-client'

interface Pet {
  id: number
  name: string
  species: 'cat' | 'dog'
}

interface IncomingEmail {
  sender: string
  subject: string
  body: string
  attachments: string[]
}

type OnTestRequestType =
  | RequestType<'callCallback', () => unknown>
  | RequestType<'getPet', (id: number) => Pet>
  | RequestType<'postMessage', (message: unknown, options?: WindowPostMessageOptions) => undefined>
  | RequestType<'throwError', () => never>
  | RequestType<'throwLiteral', () => never>

type SendRequestType = RequestType<'callback', () => unknown>

type OnTestNotificationType =
  | NotificationType<'sendDM', [sender: string, message: string]>
  | NotificationType<
      'sendEmail',
      [sender: string, subject: string, body: string, attachments: string[]]
    >

type SendTestNotificationType =
  | NotificationType<'receivedEmail', [email: IncomingEmail]>
  | NotificationType<'void', []>

const connection = new Connection<
  OnTestRequestType,
  SendRequestType,
  OnTestNotificationType,
  SendTestNotificationType
>(globalThis)

export type TestConnection = typeof connection

connection.onRequest('callCallback', () => connection.sendRequest('callback'))

connection.onRequest('getPet', (id) => ({
  id,
  species: 'cat',
  name: 'Mr Meow'
}))

connection.onRequest('postMessage', (message, options): undefined => {
  globalThis.postMessage(message, options)
})

function four(): never {
  throw new Error('I can only count to four', { cause: 'Math' })
}

function three(): never {
  four()
}

connection.onRequest('throwError', () => {
  three()
})

connection.onRequest('throwLiteral', () => {
  // eslint-disable-next-line no-throw-literal
  throw 'literal'
})

connection.onNotification('sendEmail', (sender, subject, body, attachments) => {
  connection.sendNotification('void')
  connection.sendNotification('receivedEmail', { sender, subject, body, attachments })
})
