
const Redlock = require( 'redlock' );
const uuid = require( 'uuid' );

const LOCK_TTL = 10000;

function execAsync( instance, command, ...args ) {
  return new Promise( ( resolve, reject ) => {
    const finalArgs = args.slice();
    finalArgs.push( ( e, result ) => {
      if ( e ) { reject( e ); }
      resolve( result );
    } );
    instance[command]( ...finalArgs );
  } );
}


function retryFnOnLock( fn, ...params ) {
  // Why? to avoid having a bunch of calls being processed at the same time
  const factor = ( Math.round( Math.random() * 100 ) / 100 ) + 1;
  setTimeout( () => {
    fn( ...params );
  }, 50 * factor );
}

/**
 * Parse some value from redis
 * id:date:done
 */
function parseValue( value ) {
  const parts = value.split( ':' );
  return { id: parts[0], date: parseInt( parts[1], 10 ), done: parts[2] === 'true' };
}

function prepareValue( id, date, done = false ) {
  return `${id}:${date}:${done}`;
}

function getInWindowRequests( range, windowStart, waitForNotification ) {
  if ( waitForNotification ) {
    return range.map( parseValue ).filter( r => !r.done || r.date >= windowStart ).length;
  }
  return range.map( Number ).filter( r => r >= windowStart ).length;
}

function getRetryTime( range, window, limit, now, waitForNotification ) {
  if ( waitForNotification ) {
    const last = parseValue( range[limit - 1] ).date;
    return window - now - last;
  }
  const last = parseInt( range[limit - 1], 10 );
  return ( window - now - last );
}

/**
 * Sync the end of some request with the database
 */
async function setRequestDone( id, limit, reqKey, lockKey ) {
  let lock;
  try {
    lock = await execAsync( this.redlock, 'lock', lockKey, LOCK_TTL );
  } catch ( e ) {
    return retryFnOnLock( setRequestDone.bind( this ), id, limit, reqKey, lockKey );
  }

  const range = await execAsync( this.redis, 'lrange', reqKey, 0, limit - 1 );
  const parsedRange = range.map( parseValue );
  const index = parsedRange.findIndex( v => v.id === id );
  const element = parsedRange[index];
  const val = prepareValue( element.id, element.date, true );
  await execAsync( this.redis, 'lset', reqKey, index, val );
  lock.unlock();
}

/**
 * @class SZThrottler
 */
class SZThrottler {

  constructor( client ) {
    this.redis = client;
    this.redlock = new Redlock( [ this.redis ], {
      driftFactor: 0.01, // time in ms
      retryCount: 0
    } );
  }

  getThrottler( name, limit, period, waitForNotification = false ) {
    const window = period * 1000;
    const reqKey = `${name}:requests`;
    const lockKey = `${name}:lock`;
    const self = this;
    let retryTimeout = null;
    let killSignal = false;

    this.redis.del( reqKey );

    const throttler = async function throttler( callback ) {
      if ( killSignal ) { return; }

      let lock;

      try {
        lock = await execAsync( self.redlock, 'lock', lockKey, LOCK_TTL );
      } catch ( e ) {
        return retryFnOnLock( throttler, callback );
      }

      await execAsync( self.redis, 'ltrim', reqKey, 0, limit - 1 );

      const range = await execAsync( self.redis, 'lrange', reqKey, 0, limit - 1 );

      const now = Date.now();
      const windowStart = now - window;
      const inWindowRequests = getInWindowRequests( range, windowStart, waitForNotification );

      if ( inWindowRequests < limit ) { // have tickets
        if ( waitForNotification ) {
          const id = uuid.v4();
          const val = prepareValue( id, now );
          const insert = await execAsync( self.redis, 'lpush', reqKey, val );
          lock.unlock();
          callback( setRequestDone.bind( self, id, limit, reqKey, lockKey ) );
        } else {
          await execAsync( self.redis, 'lpush', reqKey, now );
          lock.unlock();
          callback();
        }
      } else {
        // dont have any more tickets
        const retryTime = getRetryTime( range, window, limit, now, waitForNotification );
        retryTimeout = setTimeout( () => {
          if ( killSignal ) { return; }
          throttler.call( self, callback );
        }, retryTime );
        lock.unlock();
      }
    };

    // dines a kill switch to this trottler
    Object.defineProperty( throttler, '_kill', {
      enumerable: false,
      writable: false,
      configurable: false,
      value() {
        killSignal = true;
        clearTimeout( retryTimeout );
      }
    } );

    return throttler;
  }
}

module.exports = SZThrottler;
