var assert = require('assert')
var choo = require('choo')
var html = require('choo/html')

var withConsentStatus = require('./with-consent-status')

function testView (state, emit) {
  return html`
    <div>
      <h1 id="test">${state.consentStatus.status}</h1>
    </div>
  `
}

describe('src/decorators/with-consent-status.js', function () {
  describe('withConsentStatus()', function () {
    var app
    beforeEach(function () {
      app = choo()
    })

    it('emits a query event and defers rendering of children to the next state change', function (done) {
      var wrappedView = withConsentStatus()(testView)
      var numEmitted = 0

      app.emitter.on('offen:check-consent', function () {
        setTimeout(function () {
          numEmitted++
          app.state.consentStatus = { status: 'allow' }
          result = wrappedView(app.state, app.emit)
        }, 0)
      })

      var result = wrappedView(app.state, app.emit)
      assert.strictEqual(result.querySelector('#test'), null)

      setTimeout(function () {
        var error
        try {
          assert.strictEqual(numEmitted, 1)
          assert(result.querySelector('#test'))
          assert.strictEqual(result.querySelector('#test').innerText, 'allow')
        } catch (err) {
          error = err
        }
        done(error)
      }, 50)
    })
  })
})
