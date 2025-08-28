# worker-client

[![github actions](https://github.com/remcohaszing/worker-client/actions/workflows/ci.yaml/badge.svg)](https://github.com/remcohaszing/worker-client/actions/workflows/ci.yaml)
[![codecov](https://codecov.io/gh/remcohaszing/worker-client/branch/main/graph/badge.svg)](https://codecov.io/gh/remcohaszing/worker-client)
[![npm version](https://img.shields.io/npm/v/worker-client)](https://www.npmjs.com/package/worker-client)
[![npm downloads](https://img.shields.io/npm/dm/worker-client)](https://www.npmjs.com/package/worker-client)

Type-safe worker communication based on `postMessage`.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
  - [Basic usage](#basic-usage)
  - [Bridge mode](#bridge-mode)
- [API](#api)
  - [`createConnection`](#createconnection)
  - [`createBridge`](#createbridge)
  - [`Connection`](#connection)
  - [`Connection.invert`](#connectioninvert)
  - [`Connection.getOnRequestType`](#connectiongetonrequesttype)
  - [`Connection.getSendRequestType`](#connectiongetsendrequesttype)
  - [`Connection.getOnNotificationType`](#connectiongetonnotificationtype)
  - [`Connection.getSendNotificationType`](#connectiongetsendnotificationtype)
  - [`RequestType`](#requesttype)
  - [`RequestType.Any`](#requesttypeany)
  - [`RequestType.fromObject<object>`](#requesttypefromobjectobject)
  - [`RequestType.toBridge<RequestType>`](#requesttypetobridgerequesttype)
  - [`RequestType.toImplementation<RequestType>`](#requesttypetoimplementationrequesttype)
  - [`NotificationType`](#notificationtype)
  - [`NotificationType.Any`](#notificationtypeany)
- [Compatibility](#compatibility)
- [Sponsoring](#sponsoring)
- [License](#license)

## Installation

```sh
npm install worker-client
```

## Usage

### Basic usage

Typically this is used for communication between a worker and the main thread. There are two types
of messages that can be sent. A request is answered with a response. The request API is based on
promises. Notifications are just sent and forgotten. There may or may not be listeners on the other
side.

To define a communication channel, first define the types. Then create a connection, for example in
a worker:

```ts
// File: worker.ts

import type { NotificationType, RequestType } from 'worker-client'

import { createConnection } from 'worker-client'

// This type defines which request listeners the worker will implement.
type ToWorkerRequestType =
  | RequestType<'substract', (a: number, b: number) => number>
  | RequestType<'sum', (a: number, b: number) => number>

// This type defines which request listeners the main thread should implement.
type ToMainRequestType =
  | RequestType<'getTheme', () => 'dark' | 'light'>
  | RequestType<'getTitle', () => string>

// This type defines which notification types the worker may listen to.
type ToWorkerNotificationType =
  | NotificationType<'event', [name: string]>
  | NotificationType<'message', [message: string]>

// This type defines which notification types the main thread may listen to.
type ToMainNotificationType =
  | NotificationType<'done', []>
  | NotificationType<'progress', [percentage: number]>

// Create a connection
const connection = createConnection<
  ToWorkerRequestType,
  ToMainRequestType,
  ToWorkerNotificationType,
  ToMainNotificationType
>(globalThis)

// Export the `WorkerConnection` type, so it can be used in the main thread.
export type WorkerConnection = typeof connection

// Implement request handlers
connection.onRequest('substract', (a, b) => a - b)
connection.onRequest('sum', (a, b) => a + b)

// Add notification listeners
connection.onNotification('event', (name) => {
  console.log('Received event', name)
})
connection.onNotification('message', (message) => {
  console.log('Received message', message)
})
```

In the main thread you can implement the inverse and send requests and notifications to the worker.

```ts
// File: main.ts

import type { Connection, NotificationType, RequestType } from 'worker-client'

import type { WorkerConnection } from './worker.ts'

import { createConnection } from 'worker-client'

// Invert the connection type
type MainConnection = Connection.invert<WorkerConnection>

// Create a web worker
const worker = new Worker(new URL('worker.ts', import.meta.url), { type: 'module' })
// Define the connection.
const connection = createConnection<MainConnection>(worker)

const three = await connection.sendRequest('substract', 7, 4)
const four = await connection.sendRequest('sum', 1, three)
connection.sendNotification('message', `Result ${four}`)
```

### Bridge mode

Often using a connection is nice, but sometimes you just want to call methods on an object. Support
this, you can use [`creatBridge`](#createbridge).

```ts
// File: worker.ts

import type { NotificationType, RequestType } from 'worker-client'

import { createBridge, createConnection } from 'worker-client'

const implementation = {
  substract(a: number, b: number) {
    return a - b
  },
  sum(a: number, b: number) {
    return a + b
  }
}

// Create a connection
const connection = createConnection<RequestType.fromObject<typeof implementation>>(globalThis)
// Create the bridge
createBridge(connection, implementation)

// Export the `WorkerConnection` type, so it can be used in the main thread.
export type WorkerConnection = typeof connection
```

```ts
// File: main.ts

import type { Connection, NotificationType, RequestType } from 'worker-client'

import type { WorkerConnection } from './worker.ts'

import { createConnection } from 'worker-client'

// Invert the connection type
type MainConnection = Connection.invert<WorkerConnection>

// Create a web worker
const worker = new Worker(new URL('worker.ts', import.meta.url), { type: 'module' })
// Define the connection.
const connection = createConnection<MainConnection>(worker)
// Create a bridge
const bridge = createBridge(connection)

const three = await bridge.substract(7, 4)
const four = await bridge.sum(1, three)
```

## API

### `createConnection`

### `createBridge`

### `Connection`

### `Connection.invert`

### `Connection.getOnRequestType`

### `Connection.getSendRequestType`

### `Connection.getOnNotificationType`

### `Connection.getSendNotificationType`

### `RequestType`

### `RequestType.Any`

### `RequestType.fromObject<object>`

### `RequestType.toBridge<RequestType>`

### `RequestType.toImplementation<RequestType>`

### `NotificationType`

### `NotificationType.Any`

## Compatibility

[![Baseline Widely available](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility/high.png)](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility)

This project aims to be compatible with
[Baseline Widely available](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility).

## Sponsoring

If you like this project, consider sponsoring me via
[GitHub Sponsors](https://github.com/sponsors/remcohaszing).

## License

[MIT](LICENSE.md) © [Remco Haszing](https://github.com/remcohaszing)
