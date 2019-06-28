var format = require('date-fns/format')
var startOfDay = require('date-fns/start_of_day')
var endOfDay = require('date-fns/end_of_day')
var addDays = require('date-fns/add_days')
var _ = require('underscore')

module.exports = generateDefaultStats

function queryWithScope (table, lowerBound, upperBound) {
  function uniqueCount (index) {
    return items(index)
      .uniqueKeys()
      .then(function (keys) {
        return keys.length
      })
  }

  function items (index) {
    return table
      .orderBy(index)
      .and(function (event) {
        var time = event.payload.timestamp
        return lowerBound <= time && time <= upperBound
      })
  }

  return {
    uniqueCount: uniqueCount,
    items: items
  }
}

function generateDefaultStats (db, query) {
  var numDays = (query && query.numDays) || 7
  var now = new Date()
  var beginning = startOfDay(addDays(now, -numDays))

  var lowerBound = beginning.toJSON()
  var upperBound = now.toJSON()
  var scopedQuery = queryWithScope(db.events, lowerBound, upperBound)

  var pageviews = Promise.all(Array.from({ length: numDays })
    .map(function (num, distance) {
      var date = addDays(now, -distance)
      var lowerBound = startOfDay(date).toJSON()
      var upperBound = endOfDay(date).toJSON()
      return db.events
        .where('payload.timestamp')
        .inAnyRange([[lowerBound, upperBound]])
        .count()
        .then(function (value) {
          return { date: format(date, 'DD.MM.YYYY'), value: value }
        })
    }))
    .then(function (days) {
      return _.sortBy(days, 'date')
    })

  var uniqueUsers = scopedQuery.uniqueCount('userId')
  var uniqueAccounts = scopedQuery.uniqueCount('accountId')
  var uniqueSessions = scopedQuery.uniqueCount('payload.sessionId')

  var referrers = db.events
    .toArray(function (events) {
      const perHost = events
        .filter(function (event) {
          if (!event.payload || !event.payload.referrer) {
            return false
          }
          var referrerUrl = new window.URL(event.payload.referrer)
          var hrefUrl = new window.URL(event.payload.href)
          return referrerUrl.host !== hrefUrl.host
        })
        .map(function (event) {
          var url = new window.URL(event.payload.referrer)
          return url.host || url.href
        })
        .filter(function (referrerValue) {
          return referrerValue
        })
        .reduce(function (acc, referrerValue) {
          acc[referrerValue] = acc[referrerValue] || 0
          acc[referrerValue]++
          return acc
        }, {})
      const unique = Object.keys(perHost)
        .map(function (host) {
          return { host: host, pageviews: perHost[host] }
        })
      return _.sortBy(unique, 'pageviews').reverse()
    })

  var pages = scopedQuery.items('[accountId+payload.href]')
    .uniqueKeys(function (keys) {
      var lookups = keys.map(function (key) {
        var query = db.events.where({ '[accountId+payload.href]': key })
        var count = query.clone().count()
        var item = query.clone().first().then(function (event) {
          var url = new window.URL(event.payload.href)
          return { origin: url.origin, pathname: url.pathname }
        })
        return Promise.all([count, item]).then(function (result) {
          return Object.assign(result[1], { pageviews: result[0] })
        })
      })
      return Promise.all(lookups)
    })
    .then(function (pages) {
      return _.sortBy(pages, 'pageviews')
    })

  return Promise
    .all([
      uniqueUsers,
      uniqueAccounts,
      uniqueSessions,
      referrers,
      pages,
      pageviews
    ])
    .then(function (results) {
      return {
        uniqueUsers: results[0],
        uniqueAccounts: results[1],
        uniqueSessions: results[2],
        referrers: results[3],
        pages: results[4],
        pageviews: results[5]
      }
    })
}
