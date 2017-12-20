var assert = require('assert');
var bemhtml = require('../').bemhtml;

xdescribe('API apply', function() {
  it('should support apply', function() {
    var templates = bemhtml.compile();
    var html = templates.apply({ block: 'b' });
    assert.equal(html, '<div class="b"></div>');
  });
});
