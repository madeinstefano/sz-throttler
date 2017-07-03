const chai = require('chai');
const redis = require( 'redis' );

const expect = chai.expect;

const SZThrottler = require( '../../szthrottler' );
const id = 'sz_throttler_test'
const redisKey = `${id}:requests`; // where sz throttler saves its data

describe('SZ Throttling test', () => {

  let redisClient;
  let szThrottler;

  beforeEach( () => {
    redisClient = redis.createClient( { db: 9, host: 'localhost', port: 6379 } );
    szThrottler = new SZThrottler( redisClient );
  });

  afterEach( done => {
    redisClient.flushdb( () => {
      done();
    });
  });

  it('Should execute not more than limit of blocks on each time window', done => {
    const window = 2;
    const max = 4;
    const rate = 50;
    const wait = 2000;
    const throttler = szThrottler.getThrottler( id, max, window, false );

    let doneCount = 0;
    let insertCount = 0;

    const scheduleLoop = setInterval( () => {
      insertCount++;
      throttler( () => {
        doneCount++;
      });
    }, rate);

    setTimeout(function () {
      throttler._kill();
      clearInterval( scheduleLoop );

      expect( doneCount ).to.eql( max * ( ( wait / 1000 ) / window ) );
      done();
    }, wait );
  });

  it('Should stop executing and wait for the blocks to complete', done => {
    const window = 1;
    const max = 2;
    const rate = 100;
    const wait = 1000;
    const throttler = szThrottler.getThrottler( id, max, window, true );

    let doneCount = 0;

    const scheduleLoop = setInterval( () => {
      throttler( callback => {
        doneCount++;
      });
    }, rate);

    setTimeout( () => {
      throttler._kill();
      clearInterval( scheduleLoop );

      expect( doneCount ).to.eql( max );
      done();
    }, wait );
  });

  it('Should stop executing and wait for the blocks to complete 2', done => {
    const window = 1;
    const max = 2;
    const rate = 100;
    const wait = 1000;
    const throttler = szThrottler.getThrottler( id, max, window, true );

    let doneCount = 0;

    const scheduleLoop = setInterval( () => {
      throttler( callback => {
        doneCount++;
        callback();
      });
    }, rate);

    setTimeout( () => {
      throttler._kill();
      clearInterval( scheduleLoop );

      expect( doneCount ).to.eql( max * ( ( wait / 1000 ) / window ) );
      done();
    }, wait );
  });

});
