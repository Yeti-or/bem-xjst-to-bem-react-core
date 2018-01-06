const falafel = require('falafel');
const nEval = require('node-eval');
const bemImport = require('@bem/import-notation');
const bemjsonToJSX = require('bemjson-to-jsx');
const bemjsonToDecl = require('bemjson-to-decl');
const BemEntity = require('@bem/entity-name');
const naming = require('@bem/naming');
const pascalCase = require('pascal-case');

const { BemReactDecl } = require('./lib/bem-react-core');

const is_debug = process.env.DEBUG || false;

const log = function() {
    is_debug && console.log.apply(console, arguments);
}

class Mode {
    constructor(node) {
        this.name = node.name;
        this.type = this.name;
        this.node = node;

        this.matchers = [];
        this.shouldCallBase = false;

        if (node.parent.type === 'MemberExpression') {
            log(this.name);
            this.body = node.parent.parent.parent.arguments[0];
            this.predicateNode = node.parent.object
        } else if (node.parent.type === 'CallExpression') {
            this.body = node.parent.parent.arguments[0];
            this.predicateNode = node.parent.parent.parent.callee;
        }
    }

    toBodyString() {
        const matchers = this.matchers;
        const shouldCallBase = this.shouldCallBase;
        const body = this.body;

        let fn = 'function() {';
        if (matchers.length) {
            fn += matchers.map(match => `if (!(${match}.call(this))) { return; }`).join('\n');
        }
        if (shouldCallBase) {
            fn += `const __base = this.__base(this.props);`;
            fn += `const __useBase = (function() {`;
        }
        if (body.type === 'FunctionExpression') {
            fn += body.body.body.map(statement => statement.source()).join('\n');
        } else {
            fn += `return ${body.source()};`;
        }
        if (shouldCallBase) {
            fn += `}.call(this));`;
            // TODO what if base is node {} ? and we need return string for example?
            fn += `return { ...__useBase, ...__base };`
        }
        fn += '}';
        return fn;
    }

    toString() {
        return `${this.type}: ${this.toBodyString()}`;
    }
}

const thisCallRegExp = () => /this\.(\w)+\(/g;

// TODO separate js mode from def mode
// TODO improve Component name inside HOC
class ModeHOC extends Mode {
    constructor(node) {
        super(node);
        this.isHoc = true;
    }

    toString() {
        const matchers = this.matchers;

        let fn = '(Component) => (props) => {';
        let retComp = this.type === 'def' ? 'return <Component {...__props} />;' : 'return <Component {...__props} {...__ret} />;';
        if (matchers.length) {
            fn += matchers.map(match => `if (!(${match}.call(this))) { return ${retComp}; }`).join('\n');
        }
        if (this.body.type === 'FunctionExpression') {
            // TODO: need to rewrite this
            if (this.type === 'def' && !~this.body.source().indexOf('applyNext(')) {
                retComp = 'return __ret;';
            }
            if (thisCallRegExp().test(this.body.source())) {
                fn += `
                    const __props = { block: '${this.blockName}', ${ this.elemName ? `elem: '${this.elemName}',` : '' } ...props };
                    debugger;
                    // TODO: You probably want to reWrite it!
                    const instance = new Component(__props);
                    const __ret = (function(applyNext) {
                        ${this.body.body.body.map(statement => statement.source()).join('\n')}
                    }.bind(instance))(() => {});
                `;
            } else {
                fn += `
                    const __props = { block: '${this.blockName}', ${ this.elemName ? `elem: '${this.elemName}',` : '' } ...props };
                    const __ret = (function(applyNext) {
                        ${this.body.body.body.map(statement => statement.source()).join('\n')}
                    }.bind({ props: __props }))(() => {});
                `;
            }
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

// Change it to be real AST Node
// TODO: Total reWrite here please
class ModsMode {
    constructor(opts) {
        this.name = 'mods';
        this.type = 'mods';
        this.opts = opts || {};
    }

    toString() {
        if (this.opts.needBemjsonLikeAPI) {
            return `
                mods({ mods }) {
                    return { ...mods };
                }
            `;
        } else {
            return `
                // If there is no mods()() mode
                // TODO extract only needed values from css files
                mods() {
                    return Object.entries(this.props).reduce((acc, [key, val]) => {
                        acc[key] = val === true ? 'yes' : val;
                        return acc;
                    }, {});
                    // return { ...this.props };
                }
            `;
        }
    }
}

class AddAttrsFakeMode {
    constructor(attrsMode, addAttrsMode) {
        this.name = 'attrs';
        this.type = 'attrs';
        this.attrsMode = attrsMode;
        this.addAttrsMode = addAttrsMode;
    }

    toString() {
        return `
            attrs({ attrs }) {
                const __attrs = ${
                    this.attrsMode ?
                    `${this.attrsMode.toBodyString()}.call(this)` :
                    `attrs`
                };

                const __addAttrs = ${
                    `${this.addAttrsMode.toBodyString()}.call(this)`
                };

                return {...__attrs, ...__addAttrs};
            }
        `;
    }
}

function polyfillDecl(decl, isExtraDecl) {
    if (decl.hasMode('addAttrs')) {
        const addAttrsMode = decl.getMode('addAttrs');
        decl.deleteMode('addAttrs');
        const attrsMode = decl.getMode('attrs');
        // Should call base only for addAttrs not for attrs
        // And only if we have more then one addAttrs for decl
        // Then we generate extraDecl and call __base from mode
        isExtraDecl && (addAttrsMode.shouldCallBase = true);

        const fakeAddAttrsMode = new AddAttrsFakeMode(attrsMode, addAttrsMode);
        decl.replaceMode('attrs', fakeAddAttrsMode);
    }

    return decl;
}

function buildDeclsFromPredicate(p) {
    const decls = [];

    // one sub-predicate
    const blockSP = p.predicateParts.filter(sub => sub.type === 'block')[0];
    const elemSP = p.predicateParts.filter(sub => sub.type === 'elem')[0];
    // Arrays
    const modSPs = p.predicateParts.filter(sub => sub.type === 'mod');
    const elemModSPs = p.predicateParts.filter(sub => sub.type === 'elemMod');
    const matchSPs = p.predicateParts.filter(sub => sub.type === 'match') || [];

    const blockName = blockSP.condition.value;
    const elemName = elemSP && elemSP.condition.value;

    // TODO block_mod and elem_mod
    const bemEntity = BemEntity.create({
        block: blockName,
        elem: elemName
    });

    const decl = new BemReactDecl(bemEntity);

    // Prepare modes
    p.modes.forEach(mode => {
        if (matchSPs.length) {
            mode.matchers = mode.matchers.concat(matchSPs.map(sp => sp.condition.source()));
        }

        if (mode.type === 'def' || mode.type === 'js') {

            mode.blockName = blockName;
            mode.elemName = elemName;

            if (decl.hoc) {
                // We could add only one hoc per decl
                const extraDecl = new BemReactDecl(bemEntity, [], mode);
                decls.push([bemEntity, polyfillDecl(extraDecl)]);
            } else {
                decl.hoc = mode;
            }
        } else {
            if (decl.hasMode(mode.name)) {
                const extraDecl = new BemReactDecl(bemEntity, [mode]);
                decls.push([bemEntity, polyfillDecl(extraDecl, true)]);
            } else {
                decl.addMode(mode.name, mode);
            }
        }
    });

    decls.unshift([bemEntity, polyfillDecl(decl)]);

    return decls;

    // if (elemSP) {
    //     const elemName = elemSP.condition.value;

    //     decls.set(
    //         BemEntity.create({
    //             block: blockName,
    //             elem: elemName
    //         }),
    //         elemDecl(
    //             blockName,
    //             elemName,
    //             p.modes,
    //             matchSPs.map(sp => sp.condition.source())
    //         )
    //     );

    //     // TODO elemMods

    //     // if (elemModSPs.length) {
    //     //     const modName = sp.condition.value;
    //     //     const modVal = sp
    //     //     BemEntity.create({
    //     //         block: blockName,
    //     //         elem: elemName,
    //     //         mod: {
    //     //         }
    //     //     }),
    //     //     decls.set(
    //     //         elemModDecl(
    //     //             blockSP.condition.source(),
    //     //             elemSP.condition.source(),
    //     //             elemMods.map(sp => {
    //     //                 return {
    //     //                     modName: sp.condition.source(),
    //     //                     modVal: sp.secondCondition ? sp.secondCondition.source() : '*'
    //     //                 };
    //     //             }),
    //     //             p.modes,
    //     //             matchSPs.map(sp => sp.condition.source())
    //     //         )
    //     //     );
    //     // }

    //     if (modDecl.length) {
    //         // TODO add context to block decl and use them in modDecl
    //     }
    // } else {
    //     decls.set(
    //         BemEntity.create({
    //             block: blockName
    //         }),
    //         blockDecl(
    //             blockName,
    //             p.modes,
    //             matchSPs.map(sp => sp.condition.source())
    //         )
    //     );
    //     // TODO block_mods

    //     // if (modSPs.length) {
    //     //     decls.push(
    //     //         modDecl(
    //     //             blockSP.condition.source(),
    //     //             modSPs.map(sp => {
    //     //                 return {
    //     //                     modName: sp.condition.source(),
    //     //                     modVal: sp.secondCondition ? sp.secondCondition.source() : '*'
    //     //                 };
    //     //             }),
    //     //             p.modes,
    //     //             matchSPs.map(sp => sp.condition.source())
    //     //         )
    //     //     );
    //     // }
    // }

    // return decls;
}

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
    findParentPredicates(subPredicates) {
        // let node = this.predicateNode.parent;
        let node = this.predicateNode;

        log('\nfind:', this.name, '\n');

        while (node.type !== 'Program') {
            log(node.type);
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



function transform(opts={}) {

const bemReactPath = opts.bemPath || 'bem-react-core';
const importReact = opts.noReactImport ? '' : `import React from 'react';`;
const bemjsonLike = opts.needBemjsonLikeAPI;
bemjsonLike && (opts.needModsMode = true);

// TODO decl/declMod and path to react need be params
const header = `${importReact}
// import BEM, { decl, declMod } from '${bemReactPath}';

import {Component} from 'react';
import PropTypes from 'prop-types';
import naming from '@bem/sdk.naming.presets';
import core from '${bemReactPath}/dist/Core.js';

// Component.bool2string = val => val ? 'yes' : false;

// TODO make it optional
const {Bem, decl, declMod} = core({
    preset: {
        Render: React.createElement.bind(React),
        Base: Component,
        classAttribute: 'className',
        PropTypes
    },
    naming: naming['origin']
});

const BEM = Bem;

const isSimple = (obj) => typeof obj === 'string' || typeof obj === 'number';

`;

const importResolver = (className, entity, entities) => {
    return [`import ${className} from '${bemImport.stringify(entities)}';`];
};

return function(code, mainEntity) {
    const modes = [];
    const subPredicates = [];

    const imports = [];
    const importsPerFile = new Map();


    const result = falafel(code, { sourceType: 'module' }, node => {

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

        // TODO add apply with second argument
        // Change apply()
        if (
            node.type === 'CallExpression' &&
            node.callee.type === 'Identifier' &&
            node.arguments.length === 1 &&
            node.arguments[0].type === 'Literal'
        ) {
            node.update(`this.${node.arguments[0].value}(this.props)`);
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
            let hasBlock = false;
            const isBemjson = node.properties.filter(prop => {
                if (prop.key.name === 'block') {
                    hasBlock = true;
                    return true;
                }
                return prop.key.name === 'elem';
            }).length !== 0;
            if (isBemjson) {
                // const bemjson = nEval(node.source());
                debugger;
                const wrapBemjson = (node) => {
                    const bemjson = `{
                        ${
                            node.properties.map(prop =>
                                `"${prop.key.source()}": ${
                                        ( prop.value.type === 'Literal' ) ?
                                            `${prop.value.source()}` :
                                                 ( prop.value.type === 'ObjectExpression' ) ?
                                                    `${wrapBemjson(prop.value)}` :
                                                    `"_${prop.value.source().replace(/\"/g, "'")}_"`
                                    }`
                            ).join(',')
                        }
                    }`;
                    return bemjson
                        .trim()
                        .replace(/\s\s/g, '')
                        .replace(/<.*\/>/g, '\'_$&_\'')
                        .replace(/<.*>.*<\/.*>/g, '\'_$&_\'');
                }
                const bemjson = wrapBemjson(node);

                log('BEMJSON>>>>>');
                log(bemjson);
                log('<<<<<BEMJSON');

                const bemJSON = nEval(`(${bemjson})`);
                if (!hasBlock) {
                  // TODO get block from context
                  bemJSON.block = pascalCase(mainEntity.block);
                }

                var known = bemjsonToDecl.convert(bemJSON)
                    .map(BemEntity.create)
                    // .reduce((acc, entity) => {
                    //     // group by block and elems
                    //     const entityId = BemEntity.create({ block: entity.block, elem: entity.elem }).toString();
                    //     acc.has(entityId) ? acc.get(entityId).push(entity) : acc.set(entityId, [entity]);
                    //     return acc;
                    // }, importsPerFile);

                log(imports);

                const JSX = bemjsonToJSX({ knowComponents: known }).process(bemJSON).JSX;
                log(JSX);
                log('<<<<<<<<<JSX');
                node.update(`(${
                    JSX
                        .replace('{"_', '{').replace('_"}', '}')
                        .replace('\'_', '').replace('_\'', '')
                        .replace('"_', '{').replace('_"', '}')
                })`);
            }
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


    log('\nModes:\n');
    modes.forEach(pre => log(pre.name));

    log('\n====\n');

    subPredicates.forEach(pre => {
        modes.forEach(mode => {
            if (pre.predicateNode === mode.predicateNode) {
                pre.modes.push(mode);
            }
        });

        pre.findParentPredicates(subPredicates);
    });

    const declsMap = new Map();
    subPredicates.forEach(pre => {

        log(
            pre.name, `(${pre.condition.type === 'Literal' ? pre.condition.value : 'fn'})`,
            'm:', pre.modes.length, 'parts:', pre.predicateParts.map(p => p.name).join()
        );

        if (pre.modes.length) {
            buildDeclsFromPredicate(pre)
                .reduce((acc, [entity, decl]) => {
                    acc.has(entity.id) ?
                        acc.get(entity.id).push(decl) :
                        acc.set(entity.id, [decl]);
                    return acc;
                }, declsMap);
        }
    });


    let declsStr = '\n\n';
    let exportStr = '';

    let applyDecls = opts.needToApplyDecls;

    const knowComponents = [];
    // TODO: sort by entityId, move elem variable declarations to imports
    // Or change const to var ?
    declsMap.forEach((decls, entityID) => {
        const variableName = pascalCase(entityID);
        const entity = naming.parse(entityID);
        knowComponents.push(entity);

        if (mainEntity && (!opts.needToApplyDecls)) {
            applyDecls = (entityID !== mainEntity.id);
        }

        // TODO: get these from styles
        const needModsMode = !decls.every(decl => decl.hasMode('mods'));

        declsStr += decls.map((decl, i) => {
            if (i === 0) {
                if (opts.needModsMode && needModsMode) {
                    decl.addMode('mods', new ModsMode(opts));
                }
                if (applyDecls) {
                    return `const ${variableName} = (${decl.toString()}`;
                } else {
                    return `const ${variableName} = ${decl.toString()}`;
                }
            } else {
                return `${decl.toString()}`;
            }
        }).join(applyDecls ? ', \n\n' : ';\n\n');

        if (applyDecls) {
            declsStr += ').applyDecls();\n\n';
        } else {
            declsStr += ';\n\n';
        }

        if (mainEntity && entityID === mainEntity.id) {
            exportStr += `\nexport default ${variableName};`;
        }
    })


    // TODO: add imports from *.deps.js
    importsPerFile.forEach((entities, entityId) => {
        const entity = naming.parse(entityId);
        const className = pascalCase(entityId);
        imports.push(...importResolver(className, entity, entities));
    });

    const importsStr = imports.join('\n');

    return {
        header,
        knowComponents,
        imports,
        decls: declsMap,
        declsStr,
        exportStr,
        body: header + importsStr + declsStr + exportStr
    };
};

};

module.exports = transform;
