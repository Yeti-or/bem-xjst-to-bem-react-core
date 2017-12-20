var fixtures = require('./fixtures')('bemhtml');
var test = fixtures.test;

xdescribe('BEMJSON content', function() {
  it('should render block by default as div', function () {
    test(function() {},
      [ { content: 'Hello, bemhtml!' } ],
      '<div>Hello, bemhtml!</div>');
  });
});
