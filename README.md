
# SZ Throttler

Throttler implementation to allow a maximum number of executions of some code block in a given time window across multiple instances.

This library uses Redis, to synchronize the execution, so you must have the same instance running and accessible to all instances with throttled code.

When the maximum number executions is reached, any new executions will be queued in a pool, waiting for a chance to be executed. This is when the things here are unique, as instead of waiting for all time window to pass to execute the next block, this implementations always check how many executions happened since X seconds ago (x is the time window) and execute a new block if this number is less then the configured limit.

## Usage

### Install and import

Install the lib:
`npm install sz-throttler`

Import in the application:
```js
const SZThrottler = require( 'sz-throttler' );
```

### Create a new throttler

```js
const throttler = new SZThrottler( redisClient ).getThrottler( 'my_throttler', 10, 5, false );
```

Instantiate a new throttler using a valid Redis client instance.

Than call `.getThrottler` to create a new throttler function. It can receive 4 parameters:
- **name** *{String}* Name of the throttler. Unique to the block of code intended to be executed, but will be the same across all the instances
- **maxConcurrency** *{Number}* Number of execution in the time window
- **timeWindow** *{Number}* The time window
- **waitForNotification** *{Boolean}* If this is `true`, the executed blocks will still be accounted on subsequent time windows until the code explicit calls a callback function.

### Usage

```js
throttler(function () {
  // myCode...
});
```

or, with the fourth parameter `true`:

```js
throttler(function ( notifyExecutionDone ) {
  // do shit ...
  notifyExecutionDone();
});
```

### Need to stop ASAP

throttle._kill();
