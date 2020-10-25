/**
 * Copyright 2020 - Offen Authors <hioffen@posteo.de>
 * SPDX-License-Identifier: Apache-2.0
 */

var assert = require('assert')

var eventStore = require('./event-store')

describe('src/event-store.js', function () {
  describe('validateAndParseEvent', function () {
    it('parses referrer values into a URL', function () {
      const result = eventStore.validateAndParseEvent({
        payload: {
          type: 'PAGEVIEW',
          referrer: 'https://blog.foo.bar',
          href: 'https://www.offen.dev/foo',
          timestamp: new Date().toJSON(),
          sessionId: 'session'
        }
      })
      assert(result.payload.referrer instanceof window.URL)
      // handling as a URL appends a trailing slash
      assert.strictEqual(result.payload.referrer.toString(), 'https://blog.foo.bar/')
    })
    it('skips bad referrer values', function () {
      const result = eventStore.validateAndParseEvent({
        payload: {
          type: 'PAGEVIEW',
          referrer: '<script>alert("ZALGO")</script>',
          href: 'https://shady.business',
          timestamp: new Date().toJSON(),
          sessionId: 'session'
        }
      })
      assert.strictEqual(result, null)
    })

    it('parses href values into a URL', function () {
      const result = eventStore.validateAndParseEvent({
        payload: {
          type: 'PAGEVIEW',
          href: 'https://www.offen.dev/foo/',
          timestamp: new Date().toJSON(),
          sessionId: 'session'
        }
      })
      assert(result.payload.href instanceof window.URL)
      assert.strictEqual(result.payload.href.toString(), 'https://www.offen.dev/foo/')
    })

    it('skips bad href values', function () {
      const result = eventStore.validateAndParseEvent({
        payload: {
          type: 'PAGEVIEW',
          referrer: 'https://shady.business',
          href: '<script>alert("ZALGO")</script>',
          timestamp: new Date().toJSON(),
          sessionId: 'session'
        }
      })
      assert.strictEqual(result, null)
    })

    it('skips unkown event types', function () {
      const result = eventStore.validateAndParseEvent({
        payload: {
          type: 'ZALGO',
          href: 'https://www.offen.dev/foo/',
          timestamp: new Date().toJSON(),
          sessionId: 'session'
        }
      })
      assert.strictEqual(result, null)
    })

    it('skips bad timestamps', function () {
      const result = eventStore.validateAndParseEvent({
        payload: {
          type: 'PAGEVIEW',
          href: 'https://www.offen.dev/foo/',
          timestamp: 8192,
          sessionId: 'session'
        }
      })
      assert.strictEqual(result, null)
    })

    it('normalizes trailing slashes on URLs', function () {
      let result = eventStore.validateAndParseEvent({
        payload: {
          type: 'PAGEVIEW',
          href: 'https://www.offen.dev/foo',
          timestamp: new Date().toJSON(),
          sessionId: 'session'
        }
      })
      assert.strictEqual(result.payload.href.toString(), 'https://www.offen.dev/foo/')

      result = eventStore.validateAndParseEvent({
        payload: {
          type: 'PAGEVIEW',
          href: 'https://www.offen.dev/foo/',
          timestamp: new Date().toJSON(),
          sessionId: 'session'
        }
      })
      assert.strictEqual(result.payload.href.toString(), 'https://www.offen.dev/foo/')

      result = eventStore.validateAndParseEvent({
        payload: {
          type: 'PAGEVIEW',
          href: 'https://www.offen.dev/foo/?bar-baz',
          timestamp: new Date().toJSON(),
          sessionId: 'session'
        }
      })
      assert.strictEqual(result.payload.href.toString(), 'https://www.offen.dev/foo/?bar-baz')

      result = eventStore.validateAndParseEvent({
        payload: {
          type: 'PAGEVIEW',
          href: 'https://www.offen.dev/foo?bar-baz',
          timestamp: new Date().toJSON(),
          sessionId: 'session'
        }
      })
      assert.strictEqual(result.payload.href.toString(), 'https://www.offen.dev/foo/?bar-baz')
    })
  })

  describe('aggregate(...events)', function () {
    it('aggregates objects of the same shape', function () {
      var result = eventStore.aggregate([
        { type: 'foo', value: 12 },
        { type: 'bar', value: 44 }
      ])
      assert.deepStrictEqual(result, {
        type: ['foo', 'bar'],
        value: [12, 44]
      })
    })

    it('supports passing a normalization function', function () {
      var result = eventStore.aggregate([
        { type: 'foo', payload: { value: 12 } },
        { type: 'bar', payload: { value: 44 } }
      ], function (item) {
        return {
          type: item.type,
          value: item.payload.value
        }
      })
      assert.deepStrictEqual(result, {
        type: ['foo', 'bar'],
        value: [12, 44]
      })
    })

    it('adds padding for undefined values', function () {
      var result = eventStore.aggregate([
        { solo: [99] },
        { type: 'bar', value: 12, other: 'ok' },
        { type: 'baz', value: 14, extra: true }
      ])
      assert.deepStrictEqual(result, {
        type: [undefined, 'bar', 'baz'],
        value: [undefined, 12, 14],
        extra: [undefined, undefined, true],
        other: [undefined, 'ok', undefined],
        solo: [[99], undefined, undefined]
      })
    })
  })

  describe('mergeAggregates(aggregates)', function () {
    it('merges aggregates of the same shape', function () {
      var result = eventStore.mergeAggregates([
        { type: ['a', 'b'], value: [true, false] },
        { type: ['x', 'y', 'z'], value: [1, 2, 3] }
      ])
      assert.deepStrictEqual(result, {
        type: ['a', 'b', 'x', 'y', 'z'],
        value: [true, false, 1, 2, 3]
      })
    })

    it('adds padding at the head', function () {
      var result = eventStore.mergeAggregates([
        { type: ['a', 'b'] },
        { type: ['x', 'y', 'z'], value: [1, 2, 3] }
      ])
      assert.deepStrictEqual(result, {
        type: ['a', 'b', 'x', 'y', 'z'],
        value: [undefined, undefined, 1, 2, 3]
      })
    })

    it('adds padding at the tail', function () {
      var result = eventStore.mergeAggregates([
        { type: ['a', 'b'], value: [1, 2] },
        { type: ['x', 'y', 'z'] },
        { other: [['ok']] }
      ])
      assert.deepStrictEqual(result, {
        type: ['a', 'b', 'x', 'y', 'z', undefined],
        value: [1, 2, undefined, undefined, undefined, undefined],
        other: [undefined, undefined, undefined, undefined, undefined, ['ok']]
      })
    })
  })

  describe('inflateAggregate(aggregates)', function () {
    it('deflates an aggregate into an array of objects', function () {
      var result = eventStore.inflateAggregate({
        type: ['thing', 'widget', 'roomba'],
        value: [[0], null, 'foo']
      })
      assert.deepStrictEqual(result, [
        { type: 'thing', value: [0] },
        { type: 'widget', value: null },
        { type: 'roomba', value: 'foo' }
      ])
    })
    it('throws on asymmetric input', function () {
      assert.throws(function () {
        eventStore.inflateAggregate({
          type: ['thing', 'widget', 'roomba'],
          value: [[0], null, 'foo', 'whoops']
        })
      })
    })
    it('supports passing a function for denormalizing items', function () {
      var result = eventStore.inflateAggregate({
        type: ['thing', 'widget', 'roomba'],
        value: [[0], null, 'foo']
      }, function (item) {
        return {
          type: item.type,
          payload: { value: item.value }
        }
      })
      assert.deepStrictEqual(result, [
        { type: 'thing', payload: { value: [0] } },
        { type: 'widget', payload: { value: null } },
        { type: 'roomba', payload: { value: 'foo' } }
      ])
    })
  })

  describe('removeFromAggregate(aggregate, keyRef, values)', function () {
    it('removes the matching indices from the given aggregate', function () {
      var result = eventStore.removeFromAggregate({
        type: ['a', 'b', 'x', 'y', 'z'],
        value: [true, false, 1, 2, 3]
      }, 'type', ['x', 'z'])
      assert.deepStrictEqual(result, {
        type: ['a', 'b', 'y'],
        value: [true, false, 2]
      })
    })
  })
})
