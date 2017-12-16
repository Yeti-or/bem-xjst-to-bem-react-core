const fs = require('fs');
const path = require('path');

// var bemConfig = require('bem-config')();
// var assign = require('assign-deep');
// var betterc = require('betterc');
// var bemWalk = require('bem-walk');
// var bb8 = require('bb8');
var gCST = require('gulp-cst');
var through = require('through2');
var vfs = require('vinyl-fs');
var Vinyl = require('vinyl');
var falafel = require('falafel');


// var bemEntityToVinyl = require('bem-files-to-vinyl-fs');

var devnull = require('./lib/devnull.js');

// var formatRule = require('./lib/rules/format.js');
// var depsObjIsArray = require('./lib/rules/depsObjIsArray.js');
// var blockNameShortcut = require('./lib/rules/blockNameShortcut.js');
// var elemsIsArray = require('./lib/rules/elemsIsArray.js');

class Mode {
    constructor(node) {
        this.name = node.name;
        this.node = node;

        if (node.parent.type === 'MemberExpression') {
            debugger;
            this.body = node.parent.parent.parent.arguments[0];
            this.predicateNode = node.parent.object
        } else if (node.parent.type === 'CallExpression') {
            this.body = node.parent.parent.arguments[0];
            this.predicateNode = node.parent.parent.parent;
        } else {
            console.log('!!WTF!!', name);
        }
    }
}


module.exports = function(opts) {

process.on('exit', code => {
    // console.log(`About to exit with code: ${code}`);
    // I don't understand why de f* it works like this?
    code && process.exit(code);
});

return fileNames =>
(
    //fileNames ?
    createReadableStream(fileNames) //:
    // createBemWalkStream()
)
// .pipe(gCST())
.pipe(
    through.obj(function(file, enc, next) {
        var fileContent = file.contents.toString(enc);
        try {
const header = `import React from 'react';
import {decl} from '../../common.blocks/i-bem/i-bem.react';

`;

const attrsStr = attrs => attrs ?
    Array.isArray(attrs) ? `attrs${attrs[0]} ${attrs[1]},` : `attrs: ${attrs},` :
    '';

const tagStr = tag => tag ?
    Array.isArray(tag) ? `tag${tag[0]} ${tag[1]},` : `tag: ${tag},` :
    '';
const contentStr = c => c ?
    Array.isArray(c) ? `content${c[0]} ${c[1]},` : `content: ${c},` :
    '';

const decl = (block, tag, attrs, content) => `
export default decl({
    block: '${block}',
    ${tagStr(tag)}
    ${attrsStr(attrs)}
    ${contentStr(content)}
});
`;
            const tags = [];
            const content = [];
            const attrs = [];
            const blockNames = [];

            const subPredicates = [];
            const modes = [];

            const result = falafel(fileContent, { sourceType: 'module' }, node => {

                if (
                    node.type === 'CallExpression' &&
                    node.callee.type === 'Identifier' &&
                    node.callee.name === 'block'
                ) {
                    const blockName = Object(node.arguments[0]).value
                    blockNames.push(blockName);
                    //const str = decl(blockName, tags[0]);
                    // node.update(str);
                }

                // Change ctx to props
                if (
                    node.type === 'MemberExpression' && 
                    node.object.type === 'ThisExpression' &&
                    node.property.type === 'Identifier' &&
                    node.property.name === 'ctx'
                ) {
                    node.update(`this.props`)
                }

                // tags mode
                if (
                    node.type === 'BlockStatement' &&
                    node.parent.type === 'FunctionExpression' &&
                    node.parent.parent.type === 'CallExpression' &&
                    node.parent.parent.callee.type === 'CallExpression' &&
                    node.parent.parent.callee.callee.type === 'Identifier' &&
                    node.parent.parent.callee.callee.name === 'tag'
                ) {
                    tags.push(['()', node.source()]);
                }

                if (
                    node.type === 'Literal' &&
                    node.parent.type === 'CallExpression' &&
                    node.parent.callee.type === 'CallExpression' &&
                    node.parent.callee.callee.type === 'Identifier' &&
                    node.parent.callee.callee.name === 'tag'
                ) {
                    tags.push(node.source());
                }

                // attrs mode
                if (
                    node.type === 'BlockStatement' &&
                    node.parent.type === 'FunctionExpression' &&
                    node.parent.parent.type === 'CallExpression' &&
                    node.parent.parent.callee.type === 'CallExpression' &&
                    node.parent.parent.callee.callee.type === 'Identifier' &&
                    node.parent.parent.callee.callee.name === 'attrs'
                ) {
                    attrs.push(['()', node.source()]);
                }

                if (
                    node.type === 'ObjectExpression' &&
                    node.parent.type === 'CallExpression' &&
                    node.parent.callee.type === 'CallExpression' &&
                    node.parent.callee.callee.type === 'Identifier' &&
                    node.parent.callee.callee.name === 'attrs'
                ) {
                    attrs.push(node.source());
                }

                if (
                    node.type === 'BlockStatement' &&
                    node.parent.type === 'FunctionExpression' &&
                    node.parent.parent.type === 'CallExpression' &&
                    node.parent.parent.callee.type === 'CallExpression' &&
                    node.parent.parent.callee.callee.type === 'MemberExpression' &&
                    node.parent.parent.callee.callee.property.type === 'Identifier' &&
                    node.parent.parent.callee.callee.property.name === 'attrs' &&
                    node.parent.parent.callee.callee.object.type === 'CallExpression' &&
                    node.parent.parent.callee.callee.object.callee.type === 'Identifier' &&
                    node.parent.parent.callee.callee.object.callee.name === 'match'

                ) {
                    var match = node.parent.parent.callee.callee.object.arguments[0];
                    const attrsStr = `{
                        if (!${match.source()}.call(this)) { return; }
                        ${node.body.reduce((acc, n) => { return acc += n.source(); }, '')}
                    }`;
                    attrs.push(['()', attrsStr]);
                }


                // content mode
                if (
                    node.type === 'Literal' &&
                    node.parent.type === 'CallExpression' &&
                    node.parent.callee.type === 'CallExpression' &&
                    node.parent.callee.callee.type === 'Identifier' &&
                    node.parent.callee.callee.name === 'content'
                ) {
                    content.push(node.source());
                }

                if (
                    node.type === 'ObjectExpression' &&
                    node.parent.type === 'CallExpression' &&
                    node.parent.callee.type === 'CallExpression' &&
                    node.parent.callee.callee.type === 'Identifier' &&
                    node.parent.callee.callee.name === 'content'
                ) {
                    content.push(node.source());
                }

                if (
                    node.type === 'BlockStatement' &&
                    node.parent.type === 'FunctionExpression' &&
                    node.parent.parent.type === 'CallExpression' &&
                    node.parent.parent.callee.type === 'CallExpression' &&
                    node.parent.parent.callee.callee.type === 'Identifier' &&
                    node.parent.parent.callee.callee.name === 'content'
                ) {
                    content.push(['()', node.source()]);
                }


                if (
                    node.type === 'Identifier'
                ) {
                    if (
                        node.parent.type === 'CallExpression' ||
                            (
                            node.parent.type === 'MemberExpression' &&
                            node.parent.parent.type === 'CallExpression'
                            )
                    ) {
                        if (
                            node.name === 'def' ||
                            node.name === 'tag' ||
                            node.name === 'attrs' ||
                            node.name === 'addAttrs' ||
                            node.name === 'content' ||
                            node.name === 'appendContent' ||
                            node.name === 'prependContent' ||
                            node.name === 'mix' ||
                            node.name === 'addMix' ||
                            node.name === 'mods' ||
                            node.name === 'addMods' ||
                            node.name === 'elemMods' ||
                            node.name === 'addElemMods' ||
                            node.name === 'js' ||
                            node.name === 'bem' ||
                            node.name === 'cls' ||
                            node.name === 'replace' ||
                            node.name === 'wrap' ||
                            node.name === 'extend' ||
                            node.name === 'mode'
                        ) {
                            modes.push(new Mode(node));
                        } else if (
                            node.name === 'block' ||
                            node.name === 'elem' ||
                            node.name === 'mod' ||
                            node.name === 'elemMod' ||
                            node.name === 'match'
                        ) {
                            subPredicates.push(node);
                        }
                    }
                }
            });

            //file.tree = parser.parse(fileContent);
            const contents = blockNames.reduce((acc, block, i) => {
                return (acc + decl(block, tags[i], attrs[i], content[i]));
            }, '');

            console.log('Predicates\n');
            subPredicates.forEach(pre => console.log(pre.name));

            console.log('Modes\n');
            modes.forEach(pre => console.log(pre.name));

            file.contents = Buffer.from(header + contents);
        } catch (err) {
            file.error = err;
            console.log(err);
        }

        file.path = path.join(path.dirname(file.path), path.basename(file.path, '.bemhtml.js') + '.react.js');

        console.log(file.path);
        
        next(null, file);
    })
)

// rules begin
// .pipe(rules['format'] !== null ? formatRule(rules['format'], lint) : through.obj())
// .pipe(rules['depsObjIsArray'] !== null ? depsObjIsArray(rules['depsObjIsArray'], lint) : through.obj())
// .pipe(rules['blockNameShortcut'] !== null ? blockNameShortcut(rules['blockNameShortcut'], lint) : through.obj())
// .pipe(rules['elemsIsArray'] !== null ? elemsIsArray(rules['elemsIsArray'], lint) : through.obj())
// // rules end

// .pipe(through.obj((entity, _, next) => {
//     console.log(entity.path);
//     // TODO: verbose
//     next(null, entity);
// }))
.pipe(vfs.dest('.'))
// .pipe(checkForErrors())
// .on('end', function() { this.__hasErrors && process.exit(2); })
.pipe(devnull);

};

/**
 * Find errors in files an show them to user
 *
 * @returns {Stream}
 */
function checkForErrors() {
    return through.obj(function(file, _, next) {
        if (file.errors && file.errors.length) {
            this.__hasErrors = true;
        }
        next(null, file);
    });
}

/**
 * @params {Array} files
 * @returns {Stream}
 */
function createReadableStream(files) {
    var stream = through.obj();
    [].concat(files).forEach(file => stream.push(
        new Vinyl({
            path: file,
            contents: fs.readFileSync(file)
        })
    ));
    stream.push(null);
    return stream;
}

/**
 * @returns {Stream}
 */
// function createBemWalkStream() {
//     var conf = bemConfig.levelMapSync();
//     var levels = Object.keys(conf);
//     if (config['levels']) {
//         // get levels from .deps-formatterrc
//         levels = Object.keys(config['levels']);
//     }
//     if (!levels.length) {
//         console.warn('No levels! Add .deps-formatterrc with levels');
//         // console.warn('Try to use default levels : common.blocks, ...');
//         // levels = [
//         //     'common.blocks',
//         //     'desktop.blocks',
//         //     'deskpad.blocks',
//         //     'touch.blocks',
//         //     'touch-phone.blocks',
//         //     'touch-pad.blocks'
//         // ];
//         var stream = through.obj();
//         stream.push(null);
//         return stream;
//     }
// 
//     // console.log('Levels to find deps: ');
//     // console.log(levels);
// 
//     var subLevelsMasks = config['subLevelsMasks'];
//     // if (subLevelsMasks) {
//     //     // console.log('And subLevels masks: ');
//     //     // Object.keys(subLevelsMasks).forEach(key => console.log(key + ': ', subLevelsMasks[key]));
//     // }
// 
//     return bemWalk(levels)
//         // extend bem-walker
//         .pipe(subLevelsMasks ? bb8(subLevelsMasks) : through.obj())
//         // filter deps.js
//         .pipe(through.obj(function(entity, _, next) {
//             next(null, entity.tech === 'deps.js' ? entity : null);
//         }))
//         .pipe(bemEntityToVinyl());
// }

