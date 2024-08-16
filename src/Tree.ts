import { randomUUID } from "node:crypto";
import { join } from "node:path";

export class Root {
    #filename: string = 'app';
    get filename() {
      return this.#filename;
    }
    children: (Folder)[] = [];
    #random = randomUUID().replace(/-/g, '')
    get random() {
      return this.#random;
    }
    get args(): string[] {
      return [];
    }
    get returnName(): string {
      return '/';
    }
    get typeName(): string {
      return '/';
    }
    get varName(): string {
      return 'root';
    }
  
    get filePath(): string {
      return join(this.#filename);
    }
  
    get isRoot() {
      return true;
    }
  
    getAllFuncs(types = false): string {
      return this.children.map(c => c.getAllFuncs(types)).join('\n')
    }
  
    getAssign(types = false): string {
      return `${types ? '// @ts-ignore\n' : ''}export let root${types ? ': Routes' : ''} = () => \`/\``
    }
  
    getAllAssigns(types = false): string {
      const assig = this.children.map(c => c.getAllAssigns(types)).join('\n')
      return `${this.getAssign(types)}${assig ? `\n${assig}` : ''}`
    }
  
    getInterface(): string {
      return `interface Routes {
    (): \`${this.typeName}\`
    ${this.children.map(c => c.getInterface(4)).join('\n')}
}`
    }

    generateTypeScriptFile() {
        return this.getAllFuncs(true)+'\n'+this.getInterface()+'\n'+this.getAllAssigns(true)
    }

    generateJavaScriptFile() {
        return this.getAllFuncs()+'\n'+this.getAllAssigns()
    }

    generateTypeFile() {
        return `${this.getInterface()}\nexport let root: Routes`
    }
  
    toJSON() {
      return {
        name: this.#filename,
        varName: '/app',
        random: this.random,
        assign: this.getAssign(),
        children: this.children,
      };
    }
  }
  
  export class Folder extends Root {
    #parent: Folder | Root;
    get parent() {
      return this.#parent;
    }
    #filename: string;
    get filename() {
      return this.#filename;
    }
    #args: string[] = [];
    get args() {
      return this.#args;
    }
    get isRoot(): boolean {
      return false;
    }
    #tsfunc: string;
    get tsfunc() {
      return this.#tsfunc;
    }
    #jsfunc: string;
    get jsfunc() {
      return this.#jsfunc;
    }
    #returnName: string;
    get returnName(): string {
      return this.#returnName;
    }
    #typeName: string;
    get typeName(): string {
      return this.#typeName;
    }
    #comment: string;
    get comment(): string {
      return this.#comment;
    }
    #filePath: string;
    get filePath(): string {
      return this.#filePath;
    }
    #varName: string;
    get varName(): string {
      return this.#varName;
    }
  
    constructor(filename: string, parent: Folder | Root) {
      super();
      this.#filename = filename;
      this.#parent = parent;
      this.#filePath = join(parent.filePath, filename)
      this.#args = [...this.parent.args];
  
      if (this.filename.startsWith('[') && this.filename.endsWith(']')) {
        this.#args.push(this.filename.slice(1, -1))
      }
  
      if (this.filename.startsWith('[') && this.filename.endsWith(']')) {
        this.#returnName = this.parent.returnName + '/${$' + this.filename.slice(1, -1) + '}'
        this.#typeName = this.parent.typeName + '/${string}'
        this.#varName = '$' + this.filename.slice(1, -1)
      } else {
        this.#returnName = this.parent.returnName + '/' + this.filename
        this.#typeName = this.parent.typeName + '/' + this.filename
        this.#varName = this.filename
      }
      if (this.#returnName.startsWith('//')) {
        this.#returnName = this.#returnName.slice(1)
      }
      if (this.#typeName.startsWith('//')) {
        this.#typeName = this.#typeName.slice(1)
      }
  
      this.#comment = `// fichero ${this.filePath}`
  
      this.#tsfunc = `let _${this.random} = (${this.args.map(a => `$${a}: string`).join(', ')}) => \`${this.returnName}\``
      this.#jsfunc = `let _${this.random} = (${this.args.map(a => `$${a}`).join(', ')}) => \`${this.returnName}\``
    }
  
    getAllFuncs(types = false): string {
      const funcs = this.children.map(c => c.getAllFuncs(types)).join('\n')
      const func = types ? this.tsfunc : this.jsfunc
      return `${this.comment}\n${func}${funcs?'\n'+funcs:''}`
    }
  
    getAssign(types = false): string {
      const ignoreComment = types ? '// @ts-ignore\n' : ''
      if (this.parent.isRoot) return `${this.comment}\n${ignoreComment}root.${this.varName} = _${this.random}`
      return `${this.comment}\n${ignoreComment}_${this.parent.random}.${this.varName} = _${this.random}`
    }
  
    getInterface(indent = 4): string {
      let childInterfaces = this.children.map(c => c.getInterface(indent + 4)).join('\n') ?? ''
      childInterfaces &&= '\n'+childInterfaces
      const indentStr = ' '.repeat(indent)
      const args = this.args.map(a => `$${a}: string`).join(', ')
      const functionType = `${' '.repeat(indent+4)}(${args}): \`${this.typeName}\``
      return `${indentStr}${this.varName}: {\n${functionType}${childInterfaces}\n${indentStr}}`
    }
    
  
    // @ts-ignore
    toJSON() {
      return {
        name: this.#filename,
        filePath: this.filePath,
        random: this.random,
        func: this.tsfunc,
        assign: this.getAssign(),
        children: this.children,
      };
    }
  }