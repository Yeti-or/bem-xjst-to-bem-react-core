
const prettier = require('prettier');
const babel = require('babel-core');
const nEval = require('node-eval');
const bemjsonToJSX = require('bemjson-to-jsx');
const ReactDOMServer = require('react-dom/server');
const pascalCase = require('pascal-case');
const assert = require('assert');
const HtmlDiffer = require('html-differ').HtmlDiffer;
const logger = require('html-differ/lib/logger');

const transform = require('../transform');

require('chai').should();

// TODO: https://github.com/bem-sdk-archive/bemjson-to-jsx/issues/43
const classesInseteadOfTags = function(jsx, json) {
    if (jsx.bemEntity) {
        jsx.tag = jsx.bemEntity.elem ? jsx.bemEntity.id : pascalCase(jsx.bemEntity.id);
    }
};

const unCopyMods = function (jsx, bemjson) {
    const moveToMods = (type, mods) => {
        jsx.props[type] = mods;
    }
    bemjson.elem
        ? bemjson.elemMods && moveToMods('elemMods', bemjson.elemMods)
        : bemjson.mods && moveToMods('mods', bemjson.mods);
};

const is_debug = process.env.DEBUG || false;

const log = function() {
    is_debug && console.log.apply(console, arguments);
}


module.exports = function(engine) {
  function compile(fn, options) {
    if (typeof fn !== 'function') {
      options = fn;
      fn = function() {};
    }

    if (!options) options = {};

    var api = transform(Object.assign({
        noReactImport: true,
        needToApplyDecls: true,
        needBemjsonLikeAPI:  true
    }, options));

    var entire = fn.toString(); 
    var body = entire.slice(entire.indexOf("{") + 1, entire.lastIndexOf("}"));

    // var engineName = options.engine || 'BEMHTML';
    // var Engine = require('../lib/' + engineName.toLowerCase());
    // var api = new Engine(options);
    var template = {};

    // api.compile(fn);
    var reactTemplate = api(body);
    // api.exportApply(template);
    template.apply = function(bemjson) {

        const jsx = bemjsonToJSX().use([classesInseteadOfTags, unCopyMods]).process(bemjson).JSX;

        const jsDataCode = babelTransform(`
            import React from 'react';
            ${reactTemplate.body}

            module.exports = ${jsx}
        `);

        // TODO: is it bug??
        delete require.cache[require.resolve('bem-react-core')];
        const mainElement = nEval(jsDataCode, 'test-file-name.js');

        const htmlMarkup = ReactDOMServer.renderToStaticMarkup(mainElement);

        return htmlMarkup;
    }

    return template;
  }

  function babelTransform(code) {
      const prettyOne = prettier.format(code);
      log(prettyOne);
      return babel.transform(prettyOne, {
        "presets": ["es2015", "stage-0", "react"],
        "plugins": ["transform-object-assign"],
      }).code;
  }

  function fail(fn, regexp) {
    // assert.throws(function() {
    //   compile(fn, { engine: engine });
    // }, regexp);
  }

  /**
   * test helper
   *
   * @param {?Function} fn - matchers
   * @param {BEMJSON} data - incoming bemjson
   * @param {String} expected - expected resulting html
   * @param {?Object} options - compiler options
   */
  function test(fn, data, expected, options) {
    if (typeof fn !== 'function') {
      options = expected;
      expected = data;
      data = fn;
      fn = function() {};
    }
    if (!options) options = {};

    var template = compile(fn, options);

    // if (options.flush) {
    //   template._buf = [];
    //   template.BEMContext.prototype._flush = function flush(str) {
    //     if (str !== '')
    //       template._buf.push(str);
    //     return '';
    //   };
    // }

    htmlDiffer = new HtmlDiffer({});

    // Invoke multiple times
    var count = options.count || 1;
    for (var i = 0; i < count; i++) {
      try {

        var markup = template.apply(data);
        var isEql = htmlDiffer.isEqual(markup, expected);
        var diff = isEql || htmlDiffer.diffHtml(markup, expected);
        var msg = isEql || logger.logDiffText(diff);
        assert(isEql, msg, i);
      } catch (e) {
        console.error(e.stack);
        throw e;
      }
    }

    if (options.after)
      options.after(template);
  }

  return {
    test: test,
    fail: fail,
    compile: compile
  };
};

