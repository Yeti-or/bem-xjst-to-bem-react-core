const fs = require('fs');
const path = require('path');


const transform = require('./transform');

const naming = require('@bem/naming');
// var bemConfig = require('bem-config')();
// var assign = require('assign-deep');
// var betterc = require('betterc');
// var bemWalk = require('bem-walk');
// var bb8 = require('bb8');
var gCST = require('gulp-cst');
var through = require('through2');
var vfs = require('vinyl-fs');
var Vinyl = require('vinyl');

// var bemEntityToVinyl = require('bem-files-to-vinyl-fs');

var devnull = require('./lib/devnull.js');

// var formatRule = require('./lib/rules/format.js');
// var depsObjIsArray = require('./lib/rules/depsObjIsArray.js');
// var blockNameShortcut = require('./lib/rules/blockNameShortcut.js');
// var elemsIsArray = require('./lib/rules/elemsIsArray.js');


function blockDecl(blockName, modes, matchers) {
    let decl = 'decl';

    decl += '({\n';
    decl += `block: '${blockName}',`;

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
    decl += `block: '${blockName}',`;
    decl += `elem: '${elemName}',`;

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

            const mainEntity = naming.parse(path.basename(file.path, '.bemhtml.js'));

            console.log();
            console.log('MAIN', mainEntity);
            console.log();

            const bemPath = opts.bemPath && path.relative(path.dirname(file.path), opts.bemPath);
            const XJST2REACT = transform(Object.assign(opts, { bemPath }));
            const data = XJST2REACT(file.contents, mainEntity);

            file.contents = Buffer.from(data.body);
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

