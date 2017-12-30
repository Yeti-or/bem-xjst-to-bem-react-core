var fixtures = require('./fixtures')('bemhtml');
var test = fixtures.test;

describe('BEMJSON tag', function() {
  it('should render default tag as `div`', function() {
    test(function() {},
    { block: 'b' },
    '<div class="b"></div>');
  });

  it('should return html tag', function() {
    test(function() {
      block('btn').def()(function() {
        return this.ctx.tag;
      });
    },
    { block: 'btn', tag: 'button' },
    'button');
  });

  xit('should render without tag', function() {
    test(function() {
    }, { tag: false, content: 'ok' }, 'ok');
  });

  xit('should render empty string ' +
     'if block with no content and no tag', function() {
    test(function() {
    }, { block: 'test', tag: false }, '');
  });
});
