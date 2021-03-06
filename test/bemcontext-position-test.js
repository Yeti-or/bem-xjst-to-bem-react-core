var fixtures = require('./fixtures')('bemhtml');
var test = fixtures.test;

xdescribe('BEMContext this.position', function() {
  it('should have proper this.position', function() {
    test(function() {
      block('b').content()(function() { return this.position; });
    }, [
      { block: 'b' },
      { block: 'b' },
      { block: 'b' }
    ], '<div class="b">1</div>' +
      '<div class="b">2</div>' +
      '<div class="b">3</div>');
  });

  it('should not count not bem entities', function() {
    test(function() {
      block('b').content()(function() { return this.position; });
    }, [
      { block: 'b' },
      42,
      { block: 'b' },
      'string',
      { block: 'b' },
      null,
      { block: 'b' },
      {},
      { block: 'b' }
    ], '<div class="b">1</div>' +
      '42' +
      '<div class="b">2</div>' +
      'string' +
      '<div class="b">3</div>' +
      '<div class="b">4</div>' +
      '<div></div>' +
      '<div class="b">5</div>');
  });

  it('should calc position for nested elements', function() {
    test(function() {
      block('menu').elem('item').addElemMods()(function() {
        return { pos: this.position };
      });
    },
    {
      block: 'menu',
      content: [ { elem: 'item' }, { elem: 'item' }, { elem: 'item' } ]
    },
    '<div class="menu">' +
    '<div class="menu__item menu__item_pos_1"></div>' +
    '<div class="menu__item menu__item_pos_2"></div>' +
    '<div class="menu__item menu__item_pos_3"></div>' +
    '</div>');
  });

  it('should calc position with array mess', function() {
    test(function() {
      block('menu').elem('item').addElemMods()(function() {
        return { pos: this.position };
      });
    },
    {
      block: 'menu',
      content: [
        [ { elem: 'item' } ],
        [ { elem: 'item' }, [ { elem: 'item' } ] ]
      ]
    },
    '<div class="menu">' +
    '<div class="menu__item menu__item_pos_1"></div>' +
    '<div class="menu__item menu__item_pos_2"></div>' +
    '<div class="menu__item menu__item_pos_3"></div>' +
    '</div>');
  });

  it('should calc position for single block', function() {
    test(function() {
      block('single').content()(function() {
        return this.position;
      });
    },
    { block: 'single' },
    '<div class="single">1</div>');
  });

  it('should calc position for single nested block', function() {
    test(function() {
      block('b').content()(function() {
        return this.position;
      });
    },
    { block: 'wrap', content: { block: 'b' } },
    '<div class="wrap"><div class="b">1</div></div>');
  });

  it('should calc position for single element', function() {
    test(function() {
      block('b').elem('e').content()(function() {
        return this.position;
      });
    },
    { block: 'b', content: { elem: 'e' } },
    '<div class="b"><div class="b__e">1</div></div>');
  });

  it('should calc position for nested blocks', function() {
    test(function() {
      block('*').cls()(function() {
        return this.position;
      });
    },
    { block: 'a1', content: { block: 'a2', content: { block: 'a3' } } },
    '<div class="a1 1"><div class="a2 1"><div class="a3 1"></div></div></div>');
  });

  it('should calc position with replace()', function() {
    test(function() {
      block('a').replace()({ block: 'b' });
      block('b')
        .match(function(self) { return self.isFirst(); })
        .addMods()({ first: 'yes' });

      block('b')
        .match(function(self) { return self.isLast(); })
        .addMods()({ last: 'yes' });
    },
    [ { block: 'a' }, { block: 'a' }, { block: 'a' } ],
    '<div class="b b_first_yes"></div><div class="b"></div>' +
      '<div class="b b_last_yes"></div>');
  });


  it('should calc position with appendContent()', function() {
    test(function() {
      block('a').appendContent()({ block: 'b', mix: 'added' });

      block('b')(
        match(function(self) { return self.isFirst(); })
        .addMods()({ first: 'yes' }),

        match(function(self) { return self.isLast(); })
        .addMods()({ last: 'yes' }),

        cls()(function() {
          return 'p_' + this.position;
        })
      );
    },
    { block: 'a', content: [ { block: 'b' }, { block: 'b' } ] },
    '<div class="a">' +
      '<div class="b b_first_yes p_1"></div>' +
      '<div class="b p_2"></div>' +
      '<div class="b b_last_yes added p_3"></div>' +
    '</div>');
  });

  it('should calc position with prependContent()', function() {
    test(function() {
      block('a').prependContent()({ block: 'b', mix: 'added' });

      block('b')(
        match(function(self) { return self.isFirst(); })
        .addMods()({ first: 'yes' }),

        match(function(self) { return self.isLast(); })
        .addMods()({ last: 'yes' }),

        cls()(function() {
          return 'p_' + this.position;
        })
      );
    },
    { block: 'a', content: [ { block: 'b' }, { block: 'b' } ] },
    '<div class="a">' +
      '<div class="b b_first_yes added p_1"></div>' +
      '<div class="b p_2"></div>' +
      '<div class="b b_last_yes p_3"></div>' +
    '</div>');
  });

  it('should properly set position with applyCtx()', function() {
    test(function() {
      block('a')(
        def()(function() {
          applyCtx({ block: 'session' });
          applyCtx({ block: 'session' });
          return applyNext();
        }),
        cls()(function() { return this.position; })
      );
    },
    [ { block: 'a' }, { block: 'a' }, { block: 'a' } ],
    '<div class="a 1"></div><div class="a 2"></div><div class="a 3"></div>');
  });
});
