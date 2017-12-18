const fs = require('fs');
const path = require('path');

const nEval = require('node-eval');
const bemImport = require('@bem/import-notation');
const bemjsonToJSX = require('bemjson-to-jsx');
const bemjsonToDecl = require('bemjson-to-decl');
const BemEntity = require('@bem/entity-name');
const naming = require('@bem/naming');
const pascalCase = require('pascal-case');


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

const modes = [];

class Mode {
    constructor(node) {
        this.name = node.name;
        this.type = this.name;
        this.node = node;

        if (node.parent.type === 'MemberExpression') {
            debugger;
            console.log(this.name);
            this.body = node.parent.parent.parent.arguments[0];
            this.predicateNode = node.parent.object
        } else if (node.parent.type === 'CallExpression') {
            this.body = node.parent.parent.arguments[0];
            this.predicateNode = node.parent.parent.parent.callee;
        }
    }

    toString(matchers) {
        if (matchers.length) {
            let fn = 'function() {';
            fn += matchers.map(match => `if (!(${match}.call(this))) { return; }`).join('\n');
            if (this.body.type === 'FunctionExpression') {
                fn += this.body.body.body.map(statement => statement.source()).join('\n');
            } else {
                fn += `return ${this.body.source()};`;
            }
            fn += '}';
            return `${this.type}: ${fn}`;
        } else {
            return `${this.type}: ${this.body.source()}`;
        }
    }
}

// TODO separate js mode from def mode
// TODO improve Component name inside HOC
class ModeHOC extends Mode {
    constructor(node) {
        super(node);
        this.isHoc = true;
    }

    toString(matchers) {
        let fn = '(Component) => (props) => {';
        let retComp = this.type === 'def' ? 'return <Component {...__props} />;' : 'return <Component {...__props} {...__ret} />;';
        if (matchers.length) {
            fn += matchers.map(match => `if (!(${match}.call(this))) { return ${retComp}; }`).join('\n');
        }
        if (this.body.type === 'FunctionExpression') {
            fn += `
            const __props = { ...props };
            const __ret = (function(applyNext) {
                ${this.body.body.body.map(statement => statement.source()).join('\n')}
            }.bind({ props: __props }))(() => {});
            `;
        } else {
            // TODO: Do smth here
            fn += `return ${this.body.source()};`;
        }
        fn += '\n';
        fn += retComp;
        fn += '}';
        return fn;
    }
}

function blockDecl(blockName, modes, matchers) {
    let decl = 'decl';

    decl += '({\n';
    decl += `block: ${blockName},`;

    // TODO: add these mode if there is no and option for _visible => _visible_yes
    // ANd add this only if there is no mods mode per all definition for this block
    decl += `
        // If there is no mods()() mode
        mods() {
            return Object.entries(this.props).reduce((acc, [key, val]) => {
                acc[key] = val === true ? 'yes' : val;
                return acc;
            }, {});
            return { ...this.props };
        },
    `;

    let hocModes = [];
    decl += modes.map(mode => {
        if (mode.isHoc) {
            hocModes.push(mode.toString(matchers));
            return false
        } else {
            return mode.toString(matchers)
        }
    }).filter(Boolean).join(',\n');

    // TODO actually we need several decls for each hoc
    if (hocModes.length) {
        decl += '},\n';
        decl += hocModes.join(',\n');
        decl += '\n);'
    } else {
        decl += '\n})'
    }

    return decl;
}

function elemDecl(blockName, elemName, modes) {
    let decl = 'decl';

    decl += '({\n';
    decl += `block: ${blockName},`;
    decl += `elem: ${elemName},`;

    // TODO: TEMPORARY
    decl += `modes: ${modes.length},`;

    decl += '\n})'
    return decl;
}

function modDecl(blockName, mods, modes) {
    let decl = 'decl';

    decl += 'Mod({';
    decl += mods
        .map(m => `${m.modName} : ${m.modVal}`)
        .join(', ');
    decl += '}, {\n';
    decl += `block: ${blockName},`;

    // TODO: TEMPORARY
    decl += `modes: ${modes.length},`;

    decl += '\n})'
    return decl;
}

function elemModDecl(blockName, elemName, mods, modes) {
    let decl = 'decl';

    decl += 'Mod({';
    decl += mods
        .map(m => `${m.modName} : ${m.modVal}`)
        .join(', ');
    decl += '}, {\n';
    decl += `block: ${blockName},`;
    decl += `elem: ${elemName},`;

    // TODO: TEMPORARY
    decl += `modes: ${modes.length},`;

    decl += '\n})'
    return decl;
}

function buildPredicate(p) {
    const decls = [];

    // one sub-predicate
    const blockSP = p.predicateParts.filter(sub => sub.type === 'block')[0];
    const elemSP = p.predicateParts.filter(sub => sub.type === 'elem')[0];
    // Arrays
    const modSPs = p.predicateParts.filter(sub => sub.type === 'mod');
    const elemModSPs = p.predicateParts.filter(sub => sub.type === 'elemMod');
    const matchSPs = p.predicateParts.filter(sub => sub.type === 'match') || [];

    // TODO: matchSPs

    if (elemSP) {
        decls.push(
            elemDecl(
                blockSP.condition.source(),
                elemSP.condition.source(),
                p.modes,
                matchSPs.map(sp => sp.condition.source())
            )
        );

        if (elemModSPs.length) {
            decls.push(
                elemModDecl(
                    blockSP.condition.source(),
                    elemSP.condition.source(),
                    elemMods.map(sp => {
                        return {
                            modName: sp.condition.source(),
                            modVal: sp.secondCondition ? sp.secondCondition.source() : '*'
                        };
                    }),
                    p.modes,
                    matchSPs.map(sp => sp.condition.source())
                )
            );
        }

        if (modDecl.length) {
            // TODO add context to block decl and use them in modDecl
        }
    } else {
        decls.push(
            blockDecl(
                blockSP.condition.source(),
                p.modes,
                matchSPs.map(sp => sp.condition.source())
            )
        );
        if (modSPs.length) {
            decls.push(
                modDecl(
                    blockSP.condition.source(),
                    modSPs.map(sp => {
                        return {
                            modName: sp.condition.source(),
                            modVal: sp.secondCondition ? sp.secondCondition.source() : '*'
                        };
                    }),
                    p.modes,
                    matchSPs.map(sp => sp.condition.source())
                )
            );
        }
    }

    return decls;
}

const subPredicates = [];

class SubPredicate {
    constructor(node) {
        this.name = node.name;
        this.type = this.name;
        this.node = node;
        this.modes = [];
        this.predicateParts = [this];

        if (node.parent.type === 'MemberExpression') {
            this.condition = node.parent.parent.arguments[0];
            this.predicateNode = node.parent.parent;
        } else if (node.parent.type === 'CallExpression') {
            this.condition = node.parent.arguments[0];
            this.predicateNode = node.parent;
        }
    }

    // toString() {
    //     let decl = 'decl';
    //     if (this.type === 'block' || this.type === 'elem') {
    //         decl += '({';
    //         if (this.type === 'block') {
    //             decl += `block: ${this.condition}`
    //         }
    //     }
    // }

    // TODO: move to static
    findParentPredicates() {
        // let node = this.predicateNode.parent;
        let node = this.predicateNode;

        console.log('\nfind:', this.name, '\n');

        while (node.type !== 'Program') {
            console.log(node.type);
            let part;

            if (
                node.type === 'CallExpression'
                &&
                node.callee.type === 'CallExpression'
            ) {
                part = node.callee;
                if (part !== this.predicateNode) {
                    subPredicates.forEach(pre => {
                        if (part === pre.predicateNode) {
                            // this.predicateParts.push(pre);
                            // this.predicateParts = this.predicateParts.concat(pre.predicateParts);
                            pre.predicateParts.forEach(p => {
                                this.predicateParts.includes(p) || this.predicateParts.push(p);
                            });
                        }
                    });
                }
            }

            else if (
                node.type === 'CallExpression'
                &&
                node.callee.type === 'MemberExpression'
                &&
                node.callee.object.type === 'CallExpression'
            ) {
                part = node.callee.object;
                if (part !== this.predicateNode) {
                    subPredicates.forEach(pre => {
                        if (part === pre.predicateNode) {
                            // this.predicateParts.push(pre);
                            pre.predicateParts.forEach(p => {
                                this.predicateParts.includes(p) || this.predicateParts.push(p);
                            });
                        }
                    });
                }
            }

            // TODO: we have bad traverse here but I'm tired
            // if (node.type === 'MemberExpression' && node.parent.parent.type === 'MemberExpression') {
            //     node = {parent: { type: 'Program' }};
            // }

            node = node.parent;
        }
    }
}

class MatchSubPredicate extends SubPredicate {
    constructor(node) {
        super(node);
    }
}

class ModsSubPredicate extends SubPredicate {
    constructor(node) {
        super(node);

        if (node.parent.type === 'MemberExpression') {
            this.secondCondition = node.parent.parent.arguments[1];
        } else if (node.parent.type === 'CallExpression') {
            this.secondCondition = node.parent.arguments[1];
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
            // TODO decl/declMod and path to react need be params
const header = `import React from 'react';
import {decl, declMod} from '../../common.blocks/i-bem/i-bem.react';

const isSimple = (obj) => typeof obj === 'string' || typeof obj === 'number';

`;

const importResolver = (className, entity, entities) => {
    return [`import ${className} from '${bemImport.stringify(entities)}';`];
};

const imports = [];
const importsPerFile = new Map();


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

                // Change this.ctx to props
                if (
                    node.type === 'MemberExpression' &&
                    node.object.type === 'ThisExpression' &&
                    node.property.type === 'Identifier' &&
                    node.property.name === 'ctx'
                ) {
                    node.update(`this.props`);
                }

                // Change this.mods to props
                if (
                    node.type === 'MemberExpression' &&
                    node.object.type === 'ThisExpression' &&
                    node.property.type === 'Identifier' &&
                    node.property.name === 'mods'
                ) {
                    node.update(`this.props`);
                }

                // Remove this.xmlEscape
                if (
                    node.type === 'MemberExpression' &&
                    node.object.type === 'ThisExpression' &&
                    node.property.type === 'Identifier' &&
                    node.property.name === 'xmlEscape'
                ) {
                    node.update('');
                }

                // Change isSimple to global
                if (
                    node.type === 'MemberExpression' &&
                    node.object.type === 'ThisExpression' &&
                    node.property.type === 'Identifier' &&
                    node.property.name === 'isSimple'
                ) {
                    node.update('isSimple');
                }

                // TODO o maybe not
                // Change extend to Object.assign
                if (
                    node.type === 'MemberExpression' &&
                    node.object.type === 'ThisExpression' &&
                    node.property.type === 'Identifier' &&
                    node.property.name === 'extend'
                ) {
                    node.update('Object.assign');
                }

                if (
                    node.type === 'ObjectExpression' &&
                    node.properties.length !== 0
                ) {
                    const hasBlock = false;
                    const isBemjson = node.properties.filter(prop => {
                        if (prop.key.name === 'block') {
                            hasBlock = true;
                            return true;
                        }
                        return prop.key.name === 'elem';
                    }).length !== 0;
                    if (isBemjson) {
                        // const bemjson = nEval(node.source());
                        const bemjson = `{
                            ${
                                node.properties.map(prop =>
                                    `"${prop.key.source()}": ${
                                            ( prop.value.type === 'Literal' || prop.value.type === 'ObjectExpression' ) ?
                                                `${prop.value.source()}` :
                                                `"_${prop.value.source()}_"`
                                        }`
                                ).join(',\n')
                            }
                        }`;
                        const bemJSON = nEval(`(${bemjson})`);
                        // if (!hasBlock) {
                            // TODO get block from context
                            bemJSON.block = 'Button2';
                        //}
                        console.log(bemJSON);

                        bemjsonToDecl.convert(bemJSON)
                            .map(BemEntity.create)
                            .reduce((acc, entity) => {
                                // group by block and elems
                                const entityId = BemEntity.create({ block: entity.block, elem: entity.elem }).toString();
                                acc.has(entityId) ? acc.get(entityId).push(entity) : acc.set(entityId, [entity]);
                                return acc;
                            }, importsPerFile);

                        console.log(imports);

                        const JSX = bemjsonToJSX().process(bemJSON).JSX;
                        console.log(JSX);
                        node.update(`(${
                            JSX
                                .replace('{"_', '{').replace('_"}', '}')
                                .replace('"_', '{').replace('_"', '}')
                        })`);
                    }
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

                // select(' CallExpression > CallExpression > BlockStatement [callee=Identifier] ')
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
                            node.parent.parent.type === 'CallExpression' &&
                            node.parent.object.type === 'CallExpression'
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
                            if (node.name === 'def' ||  node.name === 'js') {
                                modes.push(new ModeHOC(node));
                            } else {
                                modes.push(new Mode(node));
                            }
                        } else if (
                            node.name === 'block' ||
                            node.name === 'elem' ||
                            node.name === 'mod' ||
                            node.name === 'elemMod' ||
                            node.name === 'match'
                        ) {
                            if (node.name === 'block' || node.name === 'elem') {
                                subPredicates.push(new SubPredicate(node));
                            }

                            if (node.name === 'mod' || node.name === 'elemMod') {
                                subPredicates.push(new ModsSubPredicate(node));
                            }

                            if (node.name === 'match') {
                                subPredicates.push(new MatchSubPredicate(node));
                            }
                        }
                    }
                }
            });

            //file.tree = parser.parse(fileContent);
            const contents = blockNames.reduce((acc, block, i) => {
                return (acc + decl(block, tags[i], attrs[i], content[i]));
            }, '');

            //console.log('\nSubPredicates:\n');
            // subPredicates.forEach(pre => console.log(pre.name));

            console.log('\nModes:\n');
            modes.forEach(pre => console.log(pre.name));

            console.log('\n====\n');

            subPredicates.forEach(pre => {
                modes.forEach(mode => {
                    if (pre.predicateNode === mode.predicateNode) {
                        pre.modes.push(mode);
                    }
                });

                pre.findParentPredicates();
            });

            let decls = [];
            subPredicates.forEach(pre => {
                console.log(
                    pre.name, `(${pre.condition.type === 'Literal' ? pre.condition.value : 'fn'})`,
                    'm:', pre.modes.length, 'parts:', pre.predicateParts.map(p => p.name).join()
                );
                if (pre.modes.length) {
                    decls = decls.concat(buildPredicate(pre));
                }
            });

            importsPerFile.forEach((entities, entityId) => {
                const entity = naming.parse(entityId);
                const className = pascalCase(entityId);
                imports.push(...importResolver(className, entity, entities));
            });
            console.log(imports);
            file.contents = Buffer.from(header + imports.join('\n') + `\nmodule.exports = ${decls.join('\n')}`);
        } catch (err) {
            file.error = err;
            console.log(err);
        }

        file.path = path.join(path.dirname(file.path), path.basename(file.path, '.bemhtml.js') + '.react.js');

        console.log();
        console.log(file.path);
        console.log();
        
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

