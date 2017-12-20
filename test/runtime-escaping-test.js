var fixtures = require('./fixtures')('bemhtml');
var test = fixtures.test;

xdescribe('Content escaping', function() {
  it('should escape content if escapeContent option flag is set', function() {
    test(function() {},
      { block: 'b', content: '<script>' },
      '<div class="b">&lt;script&gt;</div>',
      { escapeContent: true });
  });

  it('shouldn’t escape content if escapeContent option flag is set to false',
    function() {
    test(function() {},
      { block: 'b', content: '<script>' },
      '<div class="b"><script></div>',
      { escapeContent: false });
  });

  it('shouldn’t escape content with html field',
    function() {
    test(function() {},
      { block: 'markup', content: { html: '<script>' } },
      '<div class="markup"><script></div>',
      { escapeContent: true });
  });

  // (miripiruni) this will be changed in next major release
  it('should escape content by default',
    function() {
    test(function() {},
      { block: 'b', content: '<script>' },
      '<div class="b">&lt;script&gt;</div>');
  });

  it('should expect raw html', function() {
    test(function() {
    }, { html: '<unescaped>' },
    '<unescaped>');
  });

  it('should work with empty string in html field', function() {
    test(function() {},
      { html: '' },
      '');
  });

  it('should ignore html field if block/elem/cls/attrs/tag exists', function() {
    test(function() {
    }, { block: 'b', html: '<unescaped>', content: 'safe text' },
    '<div class="b">safe text</div>');
  });

  it('should determine unescaped html field if there are no bem-entity ' +
    'properties', function() {
    test(function() {
    }, { html: '<unescaped>', content: 'safe text' },
    '<unescaped>');
  });

  it('should ignore html with non string value', function() {
    test(function() {
    }, [ { html: [ '<danger>' ] },
      { html: { toString: function () { return '<lol>'; } } } ],
    '<div></div><div></div>');
  });

  it('should ignore `tag:false` if html field exist', function() {
    test(function() {}, {
      tag: false,
      html: '<script>console.log("hello html");</script>'
    },
    '<script>console.log("hello html");</script>');
  });
});
