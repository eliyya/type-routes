import { writeFileSync } from 'node:fs'
import { Node } from './src/Tree.mts'

// test
const root = new Node(import.meta.resolve('../sos/src/app'), {})
console.dir(root, {
    depth: null,
})
writeFileSync('./output.js', root.generateJavaScriptFile())
writeFileSync('./output.d.ts', root.generateTypeScriptFile())

