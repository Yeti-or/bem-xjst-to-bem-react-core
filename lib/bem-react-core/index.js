
//TODO move to babel

class HOC {
    constructor(bemEntity, hoc) {
         // bla-bla
    }

    toString() {
    }
}

class BemReactDecl {
    constructor(bemEntity, modes=[], hoc) {
        this.entity = bemEntity;

        this.modes = new Map();
        modes.forEach(mode => this.addMode(mode.name, mode));

        // TODO: custom methods
        // TODO: lifeCycle Hooks
        // TODO: static methods
        // TODO: Prop-types && default Types

        this.hoc = hoc && new HOC(bemEntity, hoc);
    }

    addMode(name, mode) {
        if (this.modes.has(name)) throw new Error(`${this.entity}:: Only one mode for Decl!`);

        this.modes.set(name, mode);

        return this;
    }

    hasMode(name) {
        return this.modes.has(name);
    }

    toString() {
        let decl = 'decl';

        decl += '({\n';
        decl += `block: '${this.entity.block}',`;
        this.entity.elem && (decl += `elem: '${this.entity.elem}',`);

        decl += [...this.modes.values()].map(mode => mode.toString()).join(',\n');

        decl += '\n}';
        if (this.hoc) {
            decl += ',\n';
            decl += this.hoc.toString();
            decl += '\n';
        }
        decl += ');';

        return decl;
    }
}

module.exports = {
    BemReactDecl
}
