var assert = require('assert');
var bemhtml = require('./fixtures')('bemhtml');

xdescribe('Modes def', function() {
  it('should throw error when args passed to def mode', function() {
    assert.throws(function() {
      bemhtml.compile(function() {
        block('b1').def('blah');
      });
    });
  });
});
